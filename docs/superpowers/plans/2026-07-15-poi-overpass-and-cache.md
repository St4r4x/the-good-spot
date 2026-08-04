# POI Overpass source + geographic cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Overpass (OpenStreetMap) as a second POI source alongside Geoapify in `GET /pois`, deduplicated against Geoapify, backed by a Postgres tile cache with a 30-day TTL — without changing the `/pois` response contract or the frontend.

**Architecture:** `/pois` snaps the requested bbox onto a fixed 0.01° tile grid, reads cached tiles from Postgres, and — only if at least one tile is missing/stale — makes exactly one grouped Geoapify call and one grouped Overpass call covering the bounding box of all missing tiles, merges+dedupes the two result sets, splits them back into per-tile cache rows, and upserts them. The final response aggregates cache + fresh tiles, filtered by the exact requested bbox and groups. The Geoapify rate limit is charged at most once per request (only on real cache miss), never per tile.

**Tech Stack:** FastAPI, httpx (existing), asyncpg (new), Postgres (Supabase), pytest + respx (existing test stack), stdlib `difflib`/`math`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-15-poi-overpass-and-cache-design.md`
- Tile size: 0.01° (`tile_x = floor(lon / 0.01)`, `tile_y = floor(lat / 0.01)`)
- TTL: 30 days (tiles with `fetched_at` older than 30 days are treated as cache miss)
- Every fetched tile stores **all 8 POI groups**, regardless of which `groups` the triggering request asked for
- At most **one** Geoapify call and **one** Overpass call per `/pois` request, covering the bbox of all missing tiles combined — never one call per tile
- `DATABASE_URL` is optional: if unset, or if the DB is unreachable at request time, `/pois` falls back to a live fetch with no caching (current behavior) — must never break `/pois`
- `/pois` response contract is unchanged: `{"pois": [{"lat": float, "lon": float, "name": str | None, "group": str}]}`
- Geoapify rate limit (`RATE_LIMIT = "200/day"`, scope `"geoapify"`) is charged exactly once per `/pois` request that triggers a real Geoapify call, 0 otherwise — `/zone` and `/housing` keep their existing `@limiter.shared_limit` decorator unchanged
- Overpass has no quota tracked on our side; a failure or timeout degrades gracefully to Geoapify-only results, never a 5xx from `/pois`
- No new dependency beyond `asyncpg`; dedup uses stdlib `difflib.SequenceMatcher` and `math` (haversine), no new fuzzy-matching library
- All new backend code follows `backend/CLAUDE.md`-equivalent conventions already visible in `backend/main.py`: type hints on every function signature, f-strings, alphabetical stdlib→third-party→local imports, no bare `except:`

---

## File Structure

- `backend/poi_tiles.py` — pure tile-grid math: bbox↔tile conversion, no I/O. Used by both the cache module and `main.py`.
- `backend/poi_cache.py` — Postgres-backed cache: `get_cached_tiles`, `upsert_tiles`, connection lifecycle (`asyncpg` pool, optional). No knowledge of Geoapify/Overpass — takes/returns plain POI dicts.
- `backend/overpass.py` — Overpass client: builds the Overpass QL query for a bbox, calls `overpass-api.de`, parses the response into the same POI dict shape as Geoapify, maps OSM tags to the 8 groups. Degrades to `[]` on any failure (never raises).
- `backend/poi_dedup.py` — pure functions: `normalize_name`, `is_duplicate(poi_a, poi_b)`, `dedupe_pois(pois: list[dict]) -> list[dict]`. No I/O, no knowledge of sources beyond reading a `source`/`osm_id`/`osm_type` key on each dict.
- `backend/main.py` — modify the `/pois` handler to orchestrate: tiles → cache lookup → conditional grouped fetch → dedupe → cache upsert → aggregate → filter → manual rate-limit `hit`. Remove `@limiter.shared_limit` from `/pois` only.
- `backend/requirements.txt` — add `asyncpg`.
- `backend/tests/test_poi_tiles.py`, `backend/tests/test_poi_cache.py`, `backend/tests/test_overpass.py`, `backend/tests/test_poi_dedup.py` — new, one per module above.
- `backend/tests/test_main.py` — extend existing `/pois` tests.
- `backend/tests/conftest.py` — add a fixture providing a fake in-memory cache backend (dict-based), injected in place of the real `asyncpg` pool.
- `supabase/migrations/0001_poi_cache_tiles.sql` — new file, new `supabase/migrations/` directory.
- `README.md` — document `DATABASE_URL`, the migration, and update the `/pois` API description.
- `CHANGELOG.md` — new `## [1.2.0]` entry.
- `.env.example` — add `DATABASE_URL=`.

---

## Task 1: Tile grid math (`backend/poi_tiles.py`)

**Files:**
- Create: `backend/poi_tiles.py`
- Test: `backend/tests/test_poi_tiles.py`

**Interfaces:**
- Produces:
  - `TILE_SIZE_DEG: float = 0.01`
  - `def tile_for_point(lat: float, lon: float) -> tuple[int, int]` — returns `(tile_x, tile_y)`
  - `def bbox_to_tiles(bbox: str) -> list[tuple[int, int]]` — `bbox` is the same `"lon1,lat1,lon2,lat2"` string format already validated by `parse_bbox` in `main.py`; returns every tile intersecting it, no duplicates
  - `def tiles_bbox(tiles: list[tuple[int, int]]) -> str` — inverse-ish: smallest bbox string (`"lon1,lat1,lon2,lat2"`) covering the given tiles' full extent (used to build the single grouped fetch)

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_poi_tiles.py
from poi_tiles import bbox_to_tiles, tile_for_point, tiles_bbox


def test_tile_for_point_floors_to_grid() -> None:
    assert tile_for_point(48.856, 2.352) == (235, 4885)
    assert tile_for_point(-48.856, -2.352) == (-236, -4886)


def test_bbox_to_tiles_single_tile() -> None:
    tiles = bbox_to_tiles("2.350,48.850,2.355,48.855")
    assert tiles == [(235, 4885)]


def test_bbox_to_tiles_multiple_tiles_no_duplicates() -> None:
    tiles = bbox_to_tiles("2.30,48.80,2.32,48.82")
    assert len(tiles) == len(set(tiles))
    assert (230, 4880) in tiles
    assert (231, 4881) in tiles


def test_bbox_to_tiles_covers_exact_boundary() -> None:
    # A bbox exactly on tile boundaries must not spill into an extra tile.
    tiles = bbox_to_tiles("2.00,48.00,2.01,48.01")
    assert set(tiles) == {(200, 4800)}


def test_tiles_bbox_covers_full_extent_of_given_tiles() -> None:
    result = tiles_bbox([(235, 4885), (236, 4886)])
    lon1, lat1, lon2, lat2 = (float(p) for p in result.split(","))
    assert lon1 == pytest.approx(2.35)
    assert lat1 == pytest.approx(48.85)
    assert lon2 == pytest.approx(2.37)
    assert lat2 == pytest.approx(48.87)


def test_tiles_bbox_single_tile() -> None:
    result = tiles_bbox([(235, 4885)])
    assert result == "2.35,48.85,2.36,48.86"
```

Add `import pytest` at the top of the test file (needed for `pytest.approx`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_poi_tiles.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'poi_tiles'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/poi_tiles.py
import math

TILE_SIZE_DEG = 0.01


def tile_for_point(lat: float, lon: float) -> tuple[int, int]:
    tile_x = math.floor(lon / TILE_SIZE_DEG)
    tile_y = math.floor(lat / TILE_SIZE_DEG)
    return tile_x, tile_y


def bbox_to_tiles(bbox: str) -> list[tuple[int, int]]:
    lon1, lat1, lon2, lat2 = (float(p) for p in bbox.split(","))
    min_lon, max_lon = sorted((lon1, lon2))
    min_lat, max_lat = sorted((lat1, lat2))

    # A tile x covers [x * TILE_SIZE_DEG, (x + 1) * TILE_SIZE_DEG). The last
    # tile touched by max_lon is therefore ceil(max_lon / TILE_SIZE_DEG) - 1,
    # not ceil(...) itself — ceil() alone would add a phantom extra
    # row/column whenever max_lon isn't exactly on a tile boundary.
    x_start = math.floor(min_lon / TILE_SIZE_DEG)
    x_end = max(math.ceil(max_lon / TILE_SIZE_DEG) - 1, x_start)
    y_start = math.floor(min_lat / TILE_SIZE_DEG)
    y_end = max(math.ceil(max_lat / TILE_SIZE_DEG) - 1, y_start)

    return [
        (x, y)
        for x in range(x_start, x_end + 1)
        for y in range(y_start, y_end + 1)
    ]


def tiles_bbox(tiles: list[tuple[int, int]]) -> str:
    xs = [t[0] for t in tiles]
    ys = [t[1] for t in tiles]
    lon1 = min(xs) * TILE_SIZE_DEG
    lat1 = min(ys) * TILE_SIZE_DEG
    lon2 = (max(xs) + 1) * TILE_SIZE_DEG
    lat2 = (max(ys) + 1) * TILE_SIZE_DEG
    return f"{lon1:g},{lat1:g},{lon2:g},{lat2:g}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_poi_tiles.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/poi_tiles.py backend/tests/test_poi_tiles.py
git commit -m "feat: add POI cache tile grid math"
```

---

## Task 2: Deduplication (`backend/poi_dedup.py`)

**Files:**
- Create: `backend/poi_dedup.py`
- Test: `backend/tests/test_poi_dedup.py`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (used by Task 5 in `main.py` and internally by Task 4's cache-write path):
  - A POI dict shape used throughout the cache/dedup layer (distinct from the public `/pois` response shape — this one carries dedup metadata):
    ```python
    # {"lat": float, "lon": float, "name": str | None, "group": str,
    #  "source": "geoapify" | "overpass",
    #  "osm_id": int | None, "osm_type": str | None}
    ```
  - `def normalize_name(name: str | None) -> str` — lowercase, strip accents, strip whitespace; `""` for `None`
  - `def dedupe_pois(pois: list[dict]) -> list[dict]` — returns `pois` with duplicates removed; when two POIs are duplicates, keeps the one with `source == "geoapify"` (or either if both/neither are geoapify — see step 3); never compares POIs with different `group`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_poi_dedup.py
from poi_dedup import dedupe_pois, normalize_name


def test_normalize_name_strips_accents_and_case() -> None:
    assert normalize_name("Écoles Élémentaire") == "ecoles elementaire"


def test_normalize_name_handles_none() -> None:
    assert normalize_name(None) == ""


def _poi(**kwargs) -> dict:
    base = {
        "lat": 48.85,
        "lon": 2.35,
        "name": "Pharmacie du Village",
        "group": "health",
        "source": "geoapify",
        "osm_id": None,
        "osm_type": None,
    }
    base.update(kwargs)
    return base


def test_dedupe_keeps_single_poi_untouched() -> None:
    pois = [_poi()]
    assert dedupe_pois(pois) == pois


def test_dedupe_matches_by_identical_osm_id() -> None:
    geoapify_poi = _poi(source="geoapify", osm_id=603506496, osm_type="node")
    overpass_poi = _poi(
        source="overpass",
        osm_id=603506496,
        osm_type="node",
        name="Pharmacie du Village",
    )
    result = dedupe_pois([geoapify_poi, overpass_poi])
    assert len(result) == 1
    assert result[0]["source"] == "geoapify"


def test_dedupe_matches_by_distance_and_similar_name_when_osm_id_missing() -> None:
    geoapify_poi = _poi(lat=48.8591061, lon=2.3538958, name="Pharmacie du Village")
    overpass_poi = _poi(
        source="overpass",
        lat=48.85911,
        lon=2.35390,
        name="pharmacie du village",
    )
    result = dedupe_pois([geoapify_poi, overpass_poi])
    assert len(result) == 1
    assert result[0]["source"] == "geoapify"


def test_dedupe_keeps_both_when_too_far_apart() -> None:
    geoapify_poi = _poi(lat=48.85, lon=2.35)
    overpass_poi = _poi(source="overpass", lat=48.90, lon=2.40)
    result = dedupe_pois([geoapify_poi, overpass_poi])
    assert len(result) == 2


def test_dedupe_keeps_both_when_names_differ_even_if_close() -> None:
    geoapify_poi = _poi(lat=48.85, lon=2.35, name="Pharmacie du Village")
    overpass_poi = _poi(source="overpass", lat=48.85001, lon=2.35001, name="Boulangerie Martin")
    result = dedupe_pois([geoapify_poi, overpass_poi])
    assert len(result) == 2


def test_dedupe_never_compares_across_groups() -> None:
    geoapify_poi = _poi(lat=48.85, lon=2.35, name="Le Central", group="catering")
    overpass_poi = _poi(
        source="overpass", lat=48.85, lon=2.35, name="Le Central", group="commerce"
    )
    result = dedupe_pois([geoapify_poi, overpass_poi])
    assert len(result) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_poi_dedup.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'poi_dedup'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/poi_dedup.py
import math
import unicodedata
from difflib import SequenceMatcher

DUPLICATE_DISTANCE_METERS = 30
DUPLICATE_NAME_SIMILARITY = 0.8
EARTH_RADIUS_METERS = 6_371_000


def normalize_name(name: str | None) -> str:
    if name is None:
        return ""
    stripped = "".join(
        c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c)
    )
    return stripped.lower().strip()


def _distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(a))


def _is_duplicate(poi_a: dict, poi_b: dict) -> bool:
    if poi_a["group"] != poi_b["group"]:
        return False

    if poi_a["osm_id"] is not None and poi_b["osm_id"] is not None:
        return (
            poi_a["osm_id"] == poi_b["osm_id"]
            and poi_a["osm_type"] == poi_b["osm_type"]
        )

    distance = _distance_meters(poi_a["lat"], poi_a["lon"], poi_b["lat"], poi_b["lon"])
    if distance >= DUPLICATE_DISTANCE_METERS:
        return False

    name_a, name_b = normalize_name(poi_a["name"]), normalize_name(poi_b["name"])
    if not name_a or not name_b:
        return False
    similarity = SequenceMatcher(None, name_a, name_b).ratio()
    return similarity >= DUPLICATE_NAME_SIMILARITY


def dedupe_pois(pois: list[dict]) -> list[dict]:
    kept: list[dict] = []
    for poi in pois:
        duplicate_index = next(
            (i for i, existing in enumerate(kept) if _is_duplicate(existing, poi)),
            None,
        )
        if duplicate_index is None:
            kept.append(poi)
        elif poi["source"] == "geoapify" and kept[duplicate_index]["source"] != "geoapify":
            kept[duplicate_index] = poi
    return kept
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_poi_dedup.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/poi_dedup.py backend/tests/test_poi_dedup.py
git commit -m "feat: add POI deduplication by osm_id and distance/name fallback"
```

---

## Task 3: Overpass client (`backend/overpass.py`)

**Files:**
- Create: `backend/overpass.py`
- Test: `backend/tests/test_overpass.py`

**Interfaces:**
- Consumes: nothing from other tasks (produces the same POI dict shape defined in Task 2, with `source="overpass"`).
- Produces:
  - `OVERPASS_URL: str = "https://overpass-api.de/api/interpreter"`
  - `OVERPASS_GROUPS: dict[str, list[str]]` — mapping group → list of `(osm_key, osm_value)` tag pairs, verified live (see Step 0)
  - `async def fetch_overpass_pois(client: httpx.AsyncClient, bbox: str) -> list[dict]` — always returns a list (empty on any failure), never raises

- [ ] **Step 0: Verify the OSM tags live before writing the mapping**

Run each of these (space them out by a few seconds — the public instance rate-limits bursts; a `406`/`"server too busy"` response means wait longer and retry, not a bug):

```bash
curl -s -A "the-good-spot/1.0" "https://overpass-api.de/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:15];(node["amenity"="school"](48.85,2.34,48.86,2.36);node["amenity"="kindergarten"](48.85,2.34,48.86,2.36);); out center 3;'
```

Repeat for: `leisure=fitness_centre`, `leisure=pitch`, `leisure=sports_centre`, `shop=supermarket`, `shop=convenience`, `amenity=hospital`, `amenity=clinic`, `amenity=pharmacy`, `leisure=park`, `leisure=playground`, `amenity=restaurant`, `amenity=cafe`, `amenity=bar`, `public_transport=stop_position` (or `platform`/`station`), `tourism=museum`, `amenity=cinema`, `tourism=attraction`. Confirm each returns at least one real element with `lat`/`lon` (nodes) — for any tag that returns nothing near Paris, drop it from the mapping below rather than guessing. Record the confirmed set before Step 1.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_overpass.py
import httpx
import pytest
import respx

from overpass import OVERPASS_URL, fetch_overpass_pois

OVERPASS_RESPONSE = {
    "elements": [
        {
            "type": "node",
            "id": 603506496,
            "lat": 48.8591061,
            "lon": 2.3538958,
            "tags": {"amenity": "pharmacy", "name": "Pharmacie du Village"},
        },
        {
            "type": "way",
            "id": 12345,
            "center": {"lat": 48.86, "lon": 2.36},
            "tags": {"leisure": "pitch"},
        },
    ]
}


@pytest.mark.asyncio
@respx.mock
async def test_fetch_overpass_pois_maps_tags_to_groups() -> None:
    respx.post(OVERPASS_URL).mock(return_value=httpx.Response(200, json=OVERPASS_RESPONSE))
    async with httpx.AsyncClient() as client:
        result = await fetch_overpass_pois(client, "2.30,48.80,2.40,48.90")

    assert len(result) == 2
    pharmacy = next(p for p in result if p["osm_id"] == 603506496)
    assert pharmacy == {
        "lat": 48.8591061,
        "lon": 2.3538958,
        "name": "Pharmacie du Village",
        "group": "health",
        "source": "overpass",
        "osm_id": 603506496,
        "osm_type": "node",
    }
    pitch = next(p for p in result if p["osm_id"] == 12345)
    assert pitch["group"] == "sport"
    assert pitch["lat"] == 48.86 and pitch["lon"] == 2.36
    assert pitch["name"] is None


@pytest.mark.asyncio
@respx.mock
async def test_fetch_overpass_pois_returns_empty_list_on_timeout() -> None:
    respx.post(OVERPASS_URL).mock(side_effect=httpx.TimeoutException("timed out"))
    async with httpx.AsyncClient() as client:
        result = await fetch_overpass_pois(client, "2.30,48.80,2.40,48.90")
    assert result == []


@pytest.mark.asyncio
@respx.mock
async def test_fetch_overpass_pois_returns_empty_list_on_http_error() -> None:
    respx.post(OVERPASS_URL).mock(return_value=httpx.Response(500, text="server too busy"))
    async with httpx.AsyncClient() as client:
        result = await fetch_overpass_pois(client, "2.30,48.80,2.40,48.90")
    assert result == []


@pytest.mark.asyncio
@respx.mock
async def test_fetch_overpass_pois_returns_empty_list_on_invalid_json() -> None:
    respx.post(OVERPASS_URL).mock(return_value=httpx.Response(200, text="<html>not json</html>"))
    async with httpx.AsyncClient() as client:
        result = await fetch_overpass_pois(client, "2.30,48.80,2.40,48.90")
    assert result == []
```

This introduces `pytest.mark.asyncio` — check `backend/requirements-dev.txt` for `pytest-asyncio`; if absent, add it (Step 3 covers this) and add `asyncio_mode = auto` to `backend/pytest.ini` (create it if it doesn't exist) so the marker isn't required on every test — check first whether `pytest.ini`/`pyproject.toml` `[tool.pytest.ini_options]` already exists in `backend/` before creating a new config file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_overpass.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'overpass'`

- [ ] **Step 3: Add `pytest-asyncio` if missing, then write minimal implementation**

Check `backend/requirements-dev.txt`; if `pytest-asyncio` is absent, add it:

```
-r requirements.txt
pytest
pytest-asyncio
respx
pip-audit
```

Install it: `cd backend && pip install -r requirements-dev.txt`

If no `backend/pytest.ini` and no `[tool.pytest.ini_options]` in a `backend/pyproject.toml` exists yet, create `backend/pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
```

Then implement, using the tag set confirmed live in Step 0 (the list below is the expected shape — replace with whatever Step 0 actually confirmed):

```python
# backend/overpass.py
import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

OVERPASS_GROUPS: dict[str, list[tuple[str, str]]] = {
    "education": [("amenity", "school"), ("amenity", "kindergarten")],
    "sport": [
        ("leisure", "fitness_centre"),
        ("leisure", "pitch"),
        ("leisure", "sports_centre"),
    ],
    "commerce": [("shop", "supermarket"), ("shop", "convenience")],
    "health": [
        ("amenity", "hospital"),
        ("amenity", "clinic"),
        ("amenity", "pharmacy"),
    ],
    "parks": [("leisure", "park"), ("leisure", "playground")],
    "catering": [
        ("amenity", "restaurant"),
        ("amenity", "cafe"),
        ("amenity", "bar"),
    ],
    "public_transport": [("public_transport", "")],
    "culture": [
        ("tourism", "museum"),
        ("amenity", "cinema"),
        ("tourism", "attraction"),
    ],
}

_TAG_TO_GROUP: dict[tuple[str, str], str] = {
    tag: group for group, tags in OVERPASS_GROUPS.items() for tag in tags
}


def _build_query(bbox: str) -> str:
    lon1, lat1, lon2, lat2 = (float(p) for p in bbox.split(","))
    bbox_clause = f"{lat1},{lon1},{lat2},{lon2}"
    filters = []
    for key, value in _TAG_TO_GROUP:
        tag_filter = f'["{key}"="{value}"]' if value else f'["{key}"]'
        filters.append(f'node{tag_filter}({bbox_clause});')
        filters.append(f'way{tag_filter}({bbox_clause});')
    return f"[out:json][timeout:25];({''.join(filters)});out center;"


def _group_for_tags(tags: dict[str, str]) -> str | None:
    for key, value in tags.items():
        group = _TAG_TO_GROUP.get((key, value)) or _TAG_TO_GROUP.get((key, ""))
        if group:
            return group
    return None


async def fetch_overpass_pois(client: httpx.AsyncClient, bbox: str) -> list[dict]:
    try:
        resp = await client.post(
            OVERPASS_URL, data={"data": _build_query(bbox)}, timeout=30
        )
        resp.raise_for_status()
        elements = resp.json()["elements"]
    except (httpx.HTTPError, KeyError, ValueError):
        return []

    results = []
    for element in elements:
        tags = element.get("tags", {})
        group = _group_for_tags(tags)
        if group is None:
            continue
        if "center" in element:
            lat, lon = element["center"]["lat"], element["center"]["lon"]
        elif "lat" in element:
            lat, lon = element["lat"], element["lon"]
        else:
            continue
        results.append(
            {
                "lat": lat,
                "lon": lon,
                "name": tags.get("name"),
                "group": group,
                "source": "overpass",
                "osm_id": element["id"],
                "osm_type": element["type"],
            }
        )
    return results
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_overpass.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/overpass.py backend/tests/test_overpass.py backend/requirements-dev.txt backend/pytest.ini
git commit -m "feat: add Overpass POI client with graceful degradation"
```

---

## Task 4: Postgres tile cache (`backend/poi_cache.py`)

**Files:**
- Create: `backend/poi_cache.py`
- Create: `supabase/migrations/0001_poi_cache_tiles.sql`
- Test: `backend/tests/test_poi_cache.py`

**Interfaces:**
- Consumes: `TILE_SIZE_DEG`, `tile_for_point` from `poi_tiles` (Task 1) — used internally to split a flat POI list into per-tile rows on write.
- Produces:
  - `TILE_TTL_DAYS: int = 30`
  - `async def create_pool(database_url: str | None) -> asyncpg.Pool | None` — returns `None` if `database_url` is falsy
  - `async def get_cached_tiles(pool: asyncpg.Pool | None, tiles: list[tuple[int, int]]) -> dict[tuple[int, int], list[dict] | None]` — maps every requested tile to its cached POI list, or `None` if missing/expired/pool is `None`/DB unreachable (never raises)
  - `async def upsert_tiles(pool: asyncpg.Pool | None, pois_by_tile: dict[tuple[int, int], list[dict]]) -> None` — no-op if `pool` is `None`; logs a warning and returns (never raises) if the DB write fails

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_poi_cache_tiles.sql
create table poi_cache_tiles (
    tile_x integer not null,
    tile_y integer not null,
    pois jsonb not null,
    fetched_at timestamptz not null default now(),
    primary key (tile_x, tile_y)
);
```

- [ ] **Step 2: Write the failing tests**

```python
# backend/tests/test_poi_cache.py
from datetime import datetime, timedelta, timezone

import pytest

from poi_cache import get_cached_tiles, upsert_tiles


class _FakeRecord(dict):
    """Mimics asyncpg.Record enough for our access pattern (record["col"])."""


class _FakePool:
    def __init__(self) -> None:
        self.rows: dict[tuple[int, int], dict] = {}
        self.acquire_calls = 0

    def acquire(self):
        self.acquire_calls += 1
        return _FakeConnection(self)


class _FakeConnection:
    def __init__(self, pool: _FakePool) -> None:
        self._pool = pool

    async def __aenter__(self) -> "_FakeConnection":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def fetch(self, query: str, tile_xs: list[int], tile_ys: list[int]):
        records = []
        for x, y in zip(tile_xs, tile_ys):
            row = self._pool.rows.get((x, y))
            if row is not None:
                records.append(
                    _FakeRecord(
                        tile_x=x, tile_y=y, pois=row["pois"], fetched_at=row["fetched_at"]
                    )
                )
        return records

    async def executemany(self, query: str, args: list[tuple]) -> None:
        for tile_x, tile_y, pois, fetched_at in args:
            self._pool.rows[(tile_x, tile_y)] = {"pois": pois, "fetched_at": fetched_at}


@pytest.mark.asyncio
async def test_get_cached_tiles_returns_none_when_pool_is_none() -> None:
    result = await get_cached_tiles(None, [(1, 1)])
    assert result == {(1, 1): None}


@pytest.mark.asyncio
async def test_get_cached_tiles_returns_none_for_missing_tile() -> None:
    pool = _FakePool()
    result = await get_cached_tiles(pool, [(1, 1)])
    assert result == {(1, 1): None}


@pytest.mark.asyncio
async def test_upsert_then_get_returns_cached_pois() -> None:
    pool = _FakePool()
    pois_by_tile = {(1, 1): [{"lat": 48.85, "lon": 2.35, "name": "X", "group": "health"}]}
    await upsert_tiles(pool, pois_by_tile)

    result = await get_cached_tiles(pool, [(1, 1)])
    assert result == {(1, 1): pois_by_tile[(1, 1)]}


@pytest.mark.asyncio
async def test_get_cached_tiles_treats_expired_tile_as_miss() -> None:
    pool = _FakePool()
    stale = datetime.now(timezone.utc) - timedelta(days=31)
    pool.rows[(1, 1)] = {"pois": [{"lat": 1, "lon": 1, "name": None, "group": "parks"}], "fetched_at": stale}

    result = await get_cached_tiles(pool, [(1, 1)])
    assert result == {(1, 1): None}


@pytest.mark.asyncio
async def test_get_cached_tiles_keeps_fresh_tile() -> None:
    pool = _FakePool()
    fresh = datetime.now(timezone.utc) - timedelta(days=29)
    pois = [{"lat": 1, "lon": 1, "name": None, "group": "parks"}]
    pool.rows[(1, 1)] = {"pois": pois, "fetched_at": fresh}

    result = await get_cached_tiles(pool, [(1, 1)])
    assert result == {(1, 1): pois}


@pytest.mark.asyncio
async def test_upsert_tiles_is_noop_when_pool_is_none() -> None:
    await upsert_tiles(None, {(1, 1): []})  # must not raise
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_poi_cache.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'poi_cache'`

- [ ] **Step 4: Add `asyncpg` and write minimal implementation**

Add to `backend/requirements.txt`:

```
asyncpg
```

Install: `cd backend && pip install -r requirements.txt`

```python
# backend/poi_cache.py
import json
import logging
from datetime import datetime, timedelta, timezone

import asyncpg

TILE_TTL_DAYS = 30

_logger = logging.getLogger(__name__)


async def create_pool(database_url: str | None) -> asyncpg.Pool | None:
    if not database_url:
        return None
    try:
        return await asyncpg.create_pool(database_url)
    except OSError:
        _logger.warning("Could not connect to DATABASE_URL, running without POI cache")
        return None


async def get_cached_tiles(
    pool: asyncpg.Pool | None, tiles: list[tuple[int, int]]
) -> dict[tuple[int, int], list[dict] | None]:
    result: dict[tuple[int, int], list[dict] | None] = {tile: None for tile in tiles}
    if pool is None or not tiles:
        return result

    cutoff = datetime.now(timezone.utc) - timedelta(days=TILE_TTL_DAYS)
    tile_xs = [t[0] for t in tiles]
    tile_ys = [t[1] for t in tiles]
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                select tile_x, tile_y, pois, fetched_at
                from poi_cache_tiles
                where (tile_x, tile_y) in (
                    select * from unnest($1::int[], $2::int[])
                )
                """,
                tile_xs,
                tile_ys,
            )
    except OSError:
        _logger.warning("POI cache read failed, falling back to live fetch")
        return result

    for row in rows:
        fetched_at = row["fetched_at"]
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        if fetched_at < cutoff:
            continue
        pois = row["pois"]
        result[(row["tile_x"], row["tile_y"])] = (
            json.loads(pois) if isinstance(pois, str) else pois
        )
    return result


async def upsert_tiles(
    pool: asyncpg.Pool | None, pois_by_tile: dict[tuple[int, int], list[dict]]
) -> None:
    if pool is None or not pois_by_tile:
        return

    now = datetime.now(timezone.utc)
    args = [
        (tile_x, tile_y, json.dumps(pois), now)
        for (tile_x, tile_y), pois in pois_by_tile.items()
    ]
    try:
        async with pool.acquire() as conn:
            await conn.executemany(
                """
                insert into poi_cache_tiles (tile_x, tile_y, pois, fetched_at)
                values ($1, $2, $3, $4)
                on conflict (tile_x, tile_y)
                do update set pois = excluded.pois, fetched_at = excluded.fetched_at
                """,
                args,
            )
    except OSError:
        _logger.warning("POI cache write failed, continuing without persisting")
```

Note: the fake `_FakeConnection.fetch`/`executemany` in the tests take positional args matching real `asyncpg` calling convention (`conn.fetch(query, *args)`), and store `pois` as whatever Python object was passed — real `asyncpg` returns `jsonb` columns as `str`, which is why `get_cached_tiles` handles both `str` and already-decoded list (the fakes pass the list through directly, matching what a real round-trip through `json.dumps`/driver-decode would look like closely enough for this test double).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_poi_cache.py -v`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/poi_cache.py backend/requirements.txt supabase/migrations/0001_poi_cache_tiles.sql backend/tests/test_poi_cache.py
git commit -m "feat: add Postgres-backed POI tile cache with 30-day TTL"
```

---

## Task 5: Wire it into `/pois` (`backend/main.py`)

**Files:**
- Modify: `backend/main.py:1-263` (imports, module-level setup, `/pois` handler)
- Modify: `backend/tests/conftest.py` (add fake pool fixture)
- Modify: `backend/tests/test_main.py` (extend `/pois` tests)

**Interfaces:**
- Consumes:
  - `bbox_to_tiles`, `tiles_bbox` from `poi_tiles` (Task 1)
  - `dedupe_pois` from `poi_dedup` (Task 2)
  - `fetch_overpass_pois` from `overpass` (Task 3)
  - `create_pool`, `get_cached_tiles`, `upsert_tiles` from `poi_cache` (Task 4)
- Produces: no new public interface — this task only changes `/pois` behavior; the response shape stays `{"pois": [{"lat", "lon", "name", "group"}]}`.

- [ ] **Step 1: Write the failing tests (extend `test_main.py`)**

Add to `backend/tests/conftest.py`, reusing the same fake pool shape from Task 4's tests (duplicated here deliberately — `conftest.py` fixtures must be self-contained and this fake is small):

```python
# backend/tests/conftest.py — add below existing imports/fixtures
class _FakeCacheRecord(dict):
    pass


class _FakeCachePool:
    def __init__(self) -> None:
        self.rows: dict[tuple[int, int], dict] = {}

    def acquire(self):
        return _FakeCacheConnection(self)


class _FakeCacheConnection:
    def __init__(self, pool: _FakeCachePool) -> None:
        self._pool = pool

    async def __aenter__(self) -> "_FakeCacheConnection":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def fetch(self, query: str, tile_xs: list[int], tile_ys: list[int]):
        records = []
        for x, y in zip(tile_xs, tile_ys):
            row = self._pool.rows.get((x, y))
            if row is not None:
                records.append(
                    _FakeCacheRecord(
                        tile_x=x, tile_y=y, pois=row["pois"], fetched_at=row["fetched_at"]
                    )
                )
        return records

    async def executemany(self, query: str, args: list[tuple]) -> None:
        for tile_x, tile_y, pois, fetched_at in args:
            self._pool.rows[(tile_x, tile_y)] = {"pois": pois, "fetched_at": fetched_at}


@pytest.fixture
def fake_pool(monkeypatch: pytest.MonkeyPatch) -> _FakeCachePool:
    pool = _FakeCachePool()
    monkeypatch.setattr(main, "_db_pool", pool)
    return pool
```

Add to `backend/tests/test_main.py`:

```python
from overpass import OVERPASS_URL


@respx.mock
def test_pois_merges_geoapify_and_overpass_without_duplicates(client, auth_headers, fake_pool) -> None:
    respx.get(PLACES_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    {
                        "properties": {
                            "name": "Pharmacie du Village",
                            "categories": ["healthcare", "healthcare.pharmacy"],
                            "datasource": {"raw": {"osm_id": 603506496, "osm_type": "node"}},
                        },
                        "geometry": {"coordinates": [2.3538958, 48.8591061]},
                    }
                ]
            },
        )
    )
    respx.post(OVERPASS_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "elements": [
                    {
                        "type": "node",
                        "id": 603506496,
                        "lat": 48.8591061,
                        "lon": 2.3538958,
                        "tags": {"amenity": "pharmacy", "name": "Pharmacie du Village"},
                    },
                    {
                        "type": "node",
                        "id": 999,
                        "lat": 48.86,
                        "lon": 2.36,
                        "tags": {"amenity": "cafe", "name": "Café Overpass"},
                    },
                ]
            },
        )
    )

    resp = client.get(
        "/pois",
        params={"bbox": "2.35,48.85,2.37,48.87", "groups": "health,catering"},
        headers=auth_headers(),
    )
    assert resp.status_code == 200
    body = resp.json()
    names = {poi["name"] for poi in body["pois"]}
    assert names == {"Pharmacie du Village", "Café Overpass"}
    assert len(body["pois"]) == 2  # the shared pharmacy is not duplicated


@respx.mock
def test_pois_quota_only_charged_on_real_cache_miss(client, auth_headers, fake_pool) -> None:
    respx.get(PLACES_URL).mock(return_value=httpx.Response(200, json={"features": []}))
    respx.post(OVERPASS_URL).mock(return_value=httpx.Response(200, json={"elements": []}))
    headers = auth_headers()

    for _ in range(200):
        resp = client.get(
            "/pois",
            params={"bbox": "2.35,48.85,2.37,48.87", "groups": "health"},
            headers=headers,
        )
        assert resp.status_code == 200

    # 201st call still hits Geoapify (no results were cached — empty lists
    # from an upstream with zero POIs are cached like any other result, so
    # this loop deliberately keeps missing to prove quota is charged once
    # per request, not once per tile).
    resp = client.get(
        "/pois",
        params={"bbox": "2.35,48.85,2.37,48.87", "groups": "health"},
        headers=headers,
    )
    assert resp.status_code == 429


@respx.mock
def test_pois_second_call_on_same_bbox_does_not_hit_geoapify(client, auth_headers, fake_pool) -> None:
    geoapify_route = respx.get(PLACES_URL).mock(
        return_value=httpx.Response(200, json={"features": []})
    )
    respx.post(OVERPASS_URL).mock(return_value=httpx.Response(200, json={"elements": []}))
    headers = auth_headers()

    client.get(
        "/pois", params={"bbox": "2.35,48.85,2.37,48.87", "groups": "health"}, headers=headers
    )
    assert geoapify_route.call_count == 1

    client.get(
        "/pois", params={"bbox": "2.35,48.85,2.37,48.87", "groups": "health"}, headers=headers
    )
    assert geoapify_route.call_count == 1  # second call served entirely from cache


@respx.mock
def test_pois_falls_back_to_live_fetch_without_cache_pool(client, auth_headers) -> None:
    # No fake_pool fixture used here: main._db_pool stays at its default
    # (None, since DATABASE_URL is unset in the test environment).
    respx.get(PLACES_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    {
                        "properties": {"name": "École Jules Ferry", "categories": ["education.school"]},
                        "geometry": {"coordinates": [2.35, 48.85]},
                    }
                ]
            },
        )
    )
    respx.post(OVERPASS_URL).mock(return_value=httpx.Response(200, json={"elements": []}))

    resp = client.get(
        "/pois",
        params={"bbox": "2.3,48.8,2.4,48.9", "groups": "education"},
        headers=auth_headers(),
    )
    assert resp.status_code == 200
    assert resp.json()["pois"] == [
        {"lat": 48.85, "lon": 2.35, "name": "École Jules Ferry", "group": "education"}
    ]
```

This changes the meaning of the existing `test_pois_happy_path` and `test_rate_limit_is_shared_across_endpoints` tests (both call `/pois` and currently expect exactly the raw Geoapify shape / the old shared-limit decorator behavior). Update them:

- `test_pois_happy_path`: add `respx.post(OVERPASS_URL).mock(return_value=httpx.Response(200, json={"elements": []}))` before the request, so Overpass contributes nothing and the assertions on Geoapify-derived POIs stay valid unchanged.
- `test_rate_limit_is_shared_across_endpoints`: add the same Overpass mock; this test's loop structure (150 `/zone` calls + 50 `/pois` calls all hitting distinct-enough bboxes to force cache misses, expecting the 201st combined call to 429) still holds because each `/pois` call in that test uses the same bbox/groups repeatedly today — check after Task 5 Step 3 whether it still passes as-is; if the shared quota assertion breaks because `/pois` no longer costs 1 per call once cached, change the test's `/pois` loop to vary the bbox slightly per iteration (e.g. append `_i * 0.02` offset to lon/lat) so each of the 50 calls is a genuine cache miss and still consumes 1 credit each, preserving the original intent of the test (quota shared across `/zone` and `/pois`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_main.py -v -k pois`
Expected: FAIL — new tests fail with assertion errors (old `/pois` still single-source, no cache, decorator still present), not import errors.

- [ ] **Step 3: Modify `main.py`**

Add imports (alphabetical within groups, per project convention) near the top, after existing imports:

```python
from limits import parse as parse_rate_limit

from overpass import fetch_overpass_pois
from poi_cache import create_pool, get_cached_tiles, upsert_tiles
from poi_dedup import dedupe_pois
from poi_tiles import bbox_to_tiles, tiles_bbox
```

Add module-level state near `SUPABASE_URL`/`_jwk_client` (`main.py:21-28`):

```python
DATABASE_URL = os.environ.get("DATABASE_URL")
_db_pool = None


@app.on_event("startup")
async def _init_db_pool() -> None:
    global _db_pool
    _db_pool = await create_pool(DATABASE_URL)
```

Add a helper next to `group_for_categories` (`main.py:154-161`) to turn a Geoapify feature into the internal dict shape used by cache/dedup (distinct from the public response shape built later):

```python
def _geoapify_feature_to_poi(feature: dict, group_list: list[str]) -> dict | None:
    props = feature["properties"]
    group = group_for_categories(props.get("categories", []), group_list)
    if group is None:
        return None
    lon, lat = feature["geometry"]["coordinates"]
    raw = props.get("datasource", {}).get("raw", {})
    return {
        "lat": lat,
        "lon": lon,
        "name": props.get("name"),
        "group": group,
        "source": "geoapify",
        "osm_id": raw.get("osm_id"),
        "osm_type": raw.get("osm_type"),
    }
```

Replace the `/pois` handler (`main.py:231-262`) entirely:

```python
@app.get("/pois")
async def pois(
    request: Request, bbox: str, groups: str, _user_id: str = Depends(require_user_id)
) -> dict:
    validated_bbox = parse_bbox(bbox)
    group_list = groups.split(",")
    validate_groups(group_list)

    requested_tiles = bbox_to_tiles(validated_bbox)
    cached = await get_cached_tiles(_db_pool, requested_tiles)
    missing_tiles = [tile for tile, pois_ in cached.items() if pois_ is None]

    all_pois: list[dict] = [poi for pois_ in cached.values() if pois_ for poi in pois_]

    if missing_tiles:
        fetch_bbox = tiles_bbox(missing_tiles)
        all_categories = ",".join(cat for cats in POI_GROUPS.values() for cat in cats)

        async with httpx.AsyncClient(timeout=30) as client:
            geoapify_task = client.get(
                PLACES_URL,
                params={
                    "categories": all_categories,
                    "filter": f"rect:{fetch_bbox}",
                    "limit": 500,
                    "apiKey": GEOAPIFY_API_KEY,
                },
            )
            overpass_task = fetch_overpass_pois(client, fetch_bbox)
            geoapify_resp, overpass_pois = await asyncio.gather(geoapify_task, overpass_task)

        geoapify_resp.raise_for_status()
        limiter.limiter.hit(parse_rate_limit(RATE_LIMIT), rate_limit_key(request), "geoapify")

        geoapify_pois = [
            poi
            for feature in geoapify_resp.json()["features"]
            if (poi := _geoapify_feature_to_poi(feature, list(POI_GROUPS.keys()))) is not None
        ]
        fresh_pois = dedupe_pois(geoapify_pois + overpass_pois)

        pois_by_tile: dict[tuple[int, int], list[dict]] = {tile: [] for tile in missing_tiles}
        for poi in fresh_pois:
            tile = tile_for_point(poi["lat"], poi["lon"])
            if tile in pois_by_tile:
                pois_by_tile[tile].append(poi)
        await upsert_tiles(_db_pool, pois_by_tile)

        all_pois.extend(fresh_pois)

    bbox_lon1, bbox_lat1, bbox_lon2, bbox_lat2 = (float(p) for p in validated_bbox.split(","))
    min_lon, max_lon = sorted((bbox_lon1, bbox_lon2))
    min_lat, max_lat = sorted((bbox_lat1, bbox_lat2))

    results = [
        {"lat": poi["lat"], "lon": poi["lon"], "name": poi["name"], "group": poi["group"]}
        for poi in all_pois
        if poi["group"] in group_list
        and min_lon <= poi["lon"] <= max_lon
        and min_lat <= poi["lat"] <= max_lat
    ]
    return {"pois": results}
```

Add the missing import used above:

```python
from poi_tiles import bbox_to_tiles, tile_for_point, tiles_bbox
```

(replace the earlier partial import of `poi_tiles` with this full one).

Note `all_categories` in the grouped Geoapify fetch always requests every group's categories (all 8), per the Global Constraints rule that every fetched tile caches all groups regardless of what the current request asked for — this matches `group_for_categories`'s existing "iterate canonical `POI_GROUPS` order" behavior since we now pass `list(POI_GROUPS.keys())` as the allowed groups instead of the request's `group_list`.

- [ ] **Step 4: Run the full backend test suite**

Run: `cd backend && python -m pytest -v`
Expected: PASS, all tests green (fix any test whose assumptions about `/pois` shape/decorator changed, per the notes at the end of Step 1).

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/conftest.py backend/tests/test_main.py
git commit -m "feat: merge Overpass and Geoapify POIs through tile cache in /pois"
```

---

## Task 6: Docs, changelog, env

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update `.env.example`**

```
GEOAPIFY_API_KEY=
SUPABASE_URL=
DATABASE_URL=
```

- [ ] **Step 2: Update `README.md`**

In the `## Lancer le projet` section, after the `SUPABASE_URL` paragraph, add:

```markdown
Pour activer le cache des points d'intérêt (recommandé, réduit fortement la
consommation du quota Geoapify) : appliquer la migration
`supabase/migrations/0001_poi_cache_tiles.sql` dans le SQL editor du projet
Supabase, puis renseigner `DATABASE_URL` dans `.env` avec la connection
string Postgres du pooler Supabase (Project Settings → Database →
Connection string). Sans `DATABASE_URL`, `/pois` continue de fonctionner
sans cache (comportement précédent).
```

In `## API backend`, replace the `/pois` bullet:

```markdown
- `GET /pois?bbox=lon1,lat1,lon2,lat2&groups=education,sport,commerce,health,parks,catering,public_transport,culture`
  → retourne les points d'intérêt dans le rectangle englobant, fusionnés
  depuis Geoapify et Overpass (OpenStreetMap) et dédupliqués, groupés par
  catégorie (`name` peut être `null`). Résultats mis en cache par tuile
  géographique (~1km, 30 jours) si `DATABASE_URL` est configuré — le quota
  Geoapify n'est décompté que lorsqu'au moins une tuile n'est pas en cache.
```

In `## Structure`, update the `backend/` line:

```
├── backend/           FastAPI : /zone, /housing, /pois (Geoapify + Overpass, cache Postgres)
```

Add `supabase/` to the tree:

```
├── supabase/
│   └── migrations/     migrations SQL versionnées (appliquées à la main via le SQL editor Supabase)
```

- [ ] **Step 3: Update `CHANGELOG.md`**

Insert after the `## [Unreleased]` line (keep `[Unreleased]` empty, as the existing file does):

```markdown
## [1.2.0] - 2026-07-15

### Added
- `/pois` interroge désormais aussi Overpass (OpenStreetMap) en complément
  de Geoapify, avec déduplication des points d'intérêt communs aux deux
  sources (identité OSM, ou distance + similarité de nom en repli).
- Cache géographique des points d'intérêt en base Postgres (tuiles ~1km,
  TTL 30 jours), optionnel via la nouvelle variable d'env `DATABASE_URL` —
  nouveau dossier `supabase/migrations/` pour la migration correspondante.

### Changed
- Le quota Geoapify (`200/day`) sur `/pois` n'est désormais décompté que
  lorsqu'une requête déclenche un vrai appel Geoapify (cache manquant),
  au lieu de systématiquement à chaque appel.
```

Bump `frontend/package.json` version to match (minor bump — new capability, nothing existing breaks, per repo convention):

```bash
cd frontend && npm version 1.2.0 --no-git-tag-version
```

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md CHANGELOG.md frontend/package.json frontend/package-lock.json
git commit -m "docs: document Overpass POI source and cache setup, bump to 1.2.0"
```

---

## Self-Review Notes

- **Spec coverage:** all sections of the design doc map to a task — grid math (Task 1), dedup (Task 2), Overpass client (Task 3), cache (Task 4), `/pois` orchestration + rate limit change (Task 5), migration + docs (Task 4/6). The batched-fetch-per-request correction (spec revision after the quota risk was found) is reflected in Task 5's single grouped `geoapify_task`/`overpass_task` pair, not per-tile.
- **No placeholders:** every step has runnable code; Task 3 Step 0 is an explicit live-verification step (mirrors the same requirement the Geoapify categories went through in the original POI design), not a deferred TODO — the mapping in Step 3 is the expected/default shape and must be reconciled against what Step 0 actually confirms before commit.
- **Type/name consistency:** `poi_tiles.bbox_to_tiles`/`tiles_bbox`/`tile_for_point`, `poi_dedup.dedupe_pois`, `overpass.fetch_overpass_pois`, `poi_cache.create_pool`/`get_cached_tiles`/`upsert_tiles` are used with the same names and signatures across Tasks 1-5 as originally defined in each task's "Produces" block.
- **Existing test fallout called out explicitly:** Task 5 Step 1 flags the two pre-existing tests (`test_pois_happy_path`, `test_rate_limit_is_shared_across_endpoints`) whose assumptions change, with concrete fix instructions, rather than leaving them to silently fail.
