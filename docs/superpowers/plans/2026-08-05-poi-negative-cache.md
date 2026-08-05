# POI Negative Cache Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop caching a tile's POIs for 30 days when the fetch that produced the empty result was actually a failed Overpass call, not a genuine "nothing here."

**Architecture:** `backend/overpass.py::fetch_overpass_pois` starts returning `None` (instead of `[]`) when the Overpass HTTP call fails, times out, or returns unparseable JSON — a real successful call that finds nothing still returns `[]`, unchanged. `backend/main.py::pois()` reads that signal: it still returns whatever Geoapify found for the current request, but only calls `upsert_tiles` (persisting to the 30-day cache) when Overpass actually succeeded. Failed tiles simply stay uncached and get retried as live fetches on the next request touching them.

**Tech Stack:** Python 3.13, FastAPI, httpx, pytest + pytest-asyncio + respx (existing test stack, no new dependencies).

## Global Constraints

- No database migration. `backend/poi_cache.py` (`get_cached_tiles`, `upsert_tiles`, `TILE_TTL_DAYS`) is not modified, and neither is `supabase/migrations/0001_poi_cache_tiles.sql`.
- A tile where Overpass succeeds and legitimately finds zero POIs must still be cached for the full 30-day `TILE_TTL_DAYS`, exactly as today — do not weaken that path.
- Geoapify's failure path (`geoapify_resp.raise_for_status()`) is out of scope — it already fails loud and is not part of this fix.
- Overpass query-splitting for oversized bboxes is a separate, out-of-scope follow-up (referenced in the spec as task_72f5b590). Do not attempt it here.
- Spec: `docs/superpowers/specs/2026-08-05-poi-negative-cache-design.md`.

---

### Task 1: `fetch_overpass_pois` signals fetch failure with `None`

**Files:**
- Modify: `backend/overpass.py:58-69` (the `fetch_overpass_pois` function signature and its `except` branch)
- Modify: `backend/tests/test_overpass.py:53-81` (the three failure-path tests)

**Interfaces:**
- Produces: `fetch_overpass_pois(client: httpx.AsyncClient, bbox: str) -> list[dict] | None` — `None` means the fetch failed (network error, HTTP error status, or unparseable JSON); `[]` means the fetch succeeded and found nothing; a non-empty list means the fetch succeeded and found POIs. This is the exact signature Task 2 consumes.

- [ ] **Step 1: Update the three failure tests to expect `None` and rename them**

In `backend/tests/test_overpass.py`, replace the three tests (lines 53-81) with:

```python
@pytest.mark.asyncio
@respx.mock
async def test_fetch_overpass_pois_returns_none_on_timeout() -> None:
    respx.post(OVERPASS_URL).mock(side_effect=httpx.TimeoutException("timed out"))
    async with httpx.AsyncClient() as client:
        result = await fetch_overpass_pois(client, "2.30,48.80,2.40,48.90")
    assert result is None


@pytest.mark.asyncio
@respx.mock
async def test_fetch_overpass_pois_returns_none_on_http_error() -> None:
    respx.post(OVERPASS_URL).mock(
        return_value=httpx.Response(500, text="server too busy")
    )
    async with httpx.AsyncClient() as client:
        result = await fetch_overpass_pois(client, "2.30,48.80,2.40,48.90")
    assert result is None


@pytest.mark.asyncio
@respx.mock
async def test_fetch_overpass_pois_returns_none_on_invalid_json() -> None:
    respx.post(OVERPASS_URL).mock(
        return_value=httpx.Response(200, text="<html>not json</html>")
    )
    async with httpx.AsyncClient() as client:
        result = await fetch_overpass_pois(client, "2.30,48.80,2.40,48.90")
    assert result is None
```

Leave `test_fetch_overpass_pois_maps_tags_to_groups` (the success-path test, lines 26-50) untouched.

- [ ] **Step 2: Run the updated tests to verify they fail against the current implementation**

Run: `cd backend && .venv/bin/pytest tests/test_overpass.py -v`
Expected: the three renamed tests FAIL with `assert [] is None` (current code still returns `[]` on failure); `test_fetch_overpass_pois_maps_tags_to_groups` still PASSes.

- [ ] **Step 3: Change `fetch_overpass_pois` to return `None` on failure**

In `backend/overpass.py`, change:

```python
async def fetch_overpass_pois(client: httpx.AsyncClient, bbox: str) -> list[dict]:
    try:
        resp = await client.post(
            OVERPASS_URL,
            data={"data": _build_query(bbox)},
            timeout=30,
            headers={"User-Agent": "the-good-spot-dev (github.com/St4r4x/the-good-spot)"},
        )
        resp.raise_for_status()
        elements = resp.json()["elements"]
    except (httpx.HTTPError, KeyError, ValueError):
        return []
```

to:

```python
async def fetch_overpass_pois(client: httpx.AsyncClient, bbox: str) -> list[dict] | None:
    try:
        resp = await client.post(
            OVERPASS_URL,
            data={"data": _build_query(bbox)},
            timeout=30,
            headers={"User-Agent": "the-good-spot-dev (github.com/St4r4x/the-good-spot)"},
        )
        resp.raise_for_status()
        elements = resp.json()["elements"]
    except (httpx.HTTPError, KeyError, ValueError):
        return None
```

The rest of the function (building `results` from `elements`, the final `return results`) is unchanged — a successful call with zero matching elements still returns `[]`.

- [ ] **Step 4: Run the tests again to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_overpass.py -v`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd backend
git add overpass.py tests/test_overpass.py
git commit -m "fix: signal Overpass fetch failure with None instead of empty list"
```

---

### Task 2: `pois()` skips caching a batch when Overpass failed

**Files:**
- Modify: `backend/main.py:303-357` (inside the `pois` endpoint, the block that fetches, merges, and caches missing tiles)
- Modify: `backend/tests/test_main.py` (append a new test after `test_pois_merges_geoapify_and_overpass_without_duplicates`, i.e. after line 303)

**Interfaces:**
- Consumes: `fetch_overpass_pois(client, bbox) -> list[dict] | None` from Task 1.
- Consumes: `_FakeCachePool` fixture `fake_pool` from `backend/tests/conftest.py:100-104` — after a request, `fake_pool.rows` (a `dict[tuple[int, int], dict]`) reflects exactly which tiles were persisted via `upsert_tiles`. An empty `fake_pool.rows` after a request means nothing was cached.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_main.py` (after `test_pois_merges_geoapify_and_overpass_without_duplicates`, around line 304):

```python
@respx.mock
def test_pois_does_not_cache_tiles_when_overpass_fails(
    client, auth_headers, fake_pool
) -> None:
    respx.get(PLACES_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    {
                        "properties": {
                            "name": "Pharmacie du Village",
                            "categories": ["healthcare", "healthcare.pharmacy"],
                        },
                        "geometry": {"coordinates": [2.3538958, 48.8591061]},
                    }
                ]
            },
        )
    )
    respx.post(OVERPASS_URL).mock(
        return_value=httpx.Response(500, text="server too busy")
    )

    resp = client.get(
        "/pois",
        params={"bbox": "2.35,48.85,2.37,48.87", "groups": "health"},
        headers=auth_headers(),
    )

    assert resp.status_code == 200
    body = resp.json()
    assert [poi["name"] for poi in body["pois"]] == ["Pharmacie du Village"]
    # Overpass failed for this batch — nothing should have been persisted,
    # so the tiles stay misses and get retried live on the next request.
    assert fake_pool.rows == {}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_main.py::test_pois_does_not_cache_tiles_when_overpass_fails -v`
Expected: FAIL — currently `fake_pool.rows` is non-empty because `upsert_tiles` is always called, caching the Geoapify-only result (with `[]` standing in for the failed Overpass side) for the full TTL.

- [ ] **Step 3: Make `pois()` skip `upsert_tiles` when Overpass failed**

In `backend/main.py`, change:

```python
        geoapify_pois = [
            poi
            for feature in geoapify_resp.json()["features"]
            if (poi := _geoapify_feature_to_poi(feature, list(POI_GROUPS.keys())))
            is not None
        ]
        fresh_pois = dedupe_pois(geoapify_pois + overpass_pois)

        pois_by_tile: dict[tuple[int, int], list[dict]] = {
            tile: [] for tile in missing_tiles
        }
        for poi in fresh_pois:
            tile = tile_for_point(poi["lat"], poi["lon"])
            if tile in pois_by_tile:
                pois_by_tile[tile].append(poi)
        await upsert_tiles(_db_pool, pois_by_tile)
```

to:

```python
        geoapify_pois = [
            poi
            for feature in geoapify_resp.json()["features"]
            if (poi := _geoapify_feature_to_poi(feature, list(POI_GROUPS.keys())))
            is not None
        ]
        # overpass_pois is None when the Overpass fetch itself failed (network
        # error, HTTP error, bad JSON) — as opposed to succeeding and finding
        # nothing ([]). In that case we still answer this request with
        # whatever Geoapify found, but we must not cache the batch: caching a
        # failure as "0 POIs here" for TILE_TTL_DAYS would hide real POIs for
        # 30 days behind one transient Overpass outage.
        overpass_ok = overpass_pois is not None
        fresh_pois = dedupe_pois(geoapify_pois + (overpass_pois or []))

        pois_by_tile: dict[tuple[int, int], list[dict]] = {
            tile: [] for tile in missing_tiles
        }
        for poi in fresh_pois:
            tile = tile_for_point(poi["lat"], poi["lon"])
            if tile in pois_by_tile:
                pois_by_tile[tile].append(poi)
        if overpass_ok:
            await upsert_tiles(_db_pool, pois_by_tile)
```

- [ ] **Step 4: Run the full backend test suite to verify everything passes**

Run: `cd backend && .venv/bin/pytest -q`
Expected: all tests PASS, including the new test and every pre-existing test in `test_main.py`, `test_overpass.py`, `test_poi_cache.py`, `test_poi_dedup.py`, `test_poi_tiles.py`, `test_seed_idf_pois.py`.

- [ ] **Step 5: Commit**

```bash
cd backend
git add main.py tests/test_main.py
git commit -m "fix: skip persisting POI cache tiles when Overpass fetch failed"
```
