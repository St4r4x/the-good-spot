# Cache POI local (Île-de-France) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give local dev a Postgres-backed POI cache pre-filled for Île-de-France, so `/pois` works without hitting Overpass/Geoapify or the (sometimes-paused) remote Supabase project.

**Architecture:** Add a `db` Postgres service to `docker-compose.yml` (dev only), auto-apply the existing `poi_cache_tiles` migration on first boot, and add a one-shot script (`backend/seed_idf_pois.py`) that fills that table with Overpass POIs across a grid covering Île-de-France, reusing the existing cache/tile/fetch functions untouched. A pre-existing, unrelated bug in `backend/Dockerfile` (missing `COPY` of non-`main.py` modules) is fixed first since it blocks verifying any of this in Docker.

**Tech Stack:** Python 3.12, FastAPI, `asyncpg`, `httpx`, pytest + pytest-asyncio, Docker Compose, Postgres 17.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-04-local-idf-poi-cache-design.md` — follow it exactly; deviations must be called out.
- Dev only. Nothing in this plan changes prod behavior — prod does not consume `docker-compose.yml`.
- IDF bbox (englobante, volontairement généreuse): `1.45,48.12,3.56,49.24` (lon1,lat1,lon2,lat2).
- Seed uses **Overpass only** (no Geoapify) — zero quota consumed by seeding.
- No new tables, no new data format, no new `/pois` code path — only `docker-compose.yml`, one new script, and the Dockerfile fix.
- Python style: type hints on all signatures, f-strings, stdlib `pathlib` where relevant (n/a here), alphabetical import order (stdlib → third-party → local), no bare `except:`.
- Project version is tracked in `frontend/package.json` (currently `1.3.0`) even for backend-only changes — see prior releases (e.g. 1.2.0 was an Overpass/cache change). This is additive dev tooling → **minor** bump → `1.4.0`.

---

### Task 1: Fix backend Dockerfile (pre-existing bug, blocks verification)

**Files:**
- Modify: `backend/Dockerfile`

**Interfaces:** none (build-only change).

- [ ] **Step 1: Confirm the bug**

Run: `docker compose build backend && docker compose up -d backend && sleep 2 && docker compose logs backend --tail 20`
Expected: `ModuleNotFoundError: No module named 'overpass'` (or similar for `poi_cache`/`poi_dedup`/`poi_tiles`).

- [ ] **Step 2: Fix the Dockerfile**

`backend/Dockerfile` currently reads:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Change the `COPY main.py .` line to copy every top-level module (flat layout, no subpackage):

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Verify the fix**

Run: `docker compose build backend && docker compose up -d backend && sleep 2 && docker compose logs backend --tail 20`
Expected: no traceback; logs show uvicorn started (`Uvicorn running on http://0.0.0.0:8000`).

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/docs`
Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile
git commit -m "fix: copy all backend modules into the Docker image, not just main.py

overpass.py/poi_cache.py/poi_dedup.py/poi_tiles.py were never copied,
so the backend container has been crash-looping on import since these
modules were added — nothing exercises the actual Docker build in CI
or locally today, which is how this went unnoticed."
```

---

### Task 2: `split_bbox` pure function (TDD)

**Files:**
- Create: `backend/seed_idf_pois.py`
- Test: `backend/tests/test_seed_idf_pois.py`

**Interfaces:**
- Produces: `split_bbox(bbox: str, cols: int, rows: int) -> list[str]` — `bbox` and each returned element use the same `"lon1,lat1,lon2,lat2"` string format as `poi_tiles.bbox_to_tiles`/`tiles_bbox`. Returns `cols * rows` bbox strings, row-major order (all `cols` cells of row 0, then row 1, ...), covering the input bbox edge-to-edge with no gaps or overlaps at cell boundaries.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_seed_idf_pois.py
from seed_idf_pois import split_bbox


def test_split_bbox_3x3_grid_produces_nine_cells() -> None:
    cells = split_bbox("0,0,3,3", cols=3, rows=3)
    assert len(cells) == 9


def test_split_bbox_cells_cover_full_extent_without_gaps() -> None:
    cells = split_bbox("0,0,3,3", cols=3, rows=3)
    parsed = [tuple(float(p) for p in cell.split(",")) for cell in cells]
    lons = sorted({round(p[0], 6) for p in parsed} | {round(p[2], 6) for p in parsed})
    lats = sorted({round(p[1], 6) for p in parsed} | {round(p[3], 6) for p in parsed})
    assert lons == [0.0, 1.0, 2.0, 3.0]
    assert lats == [0.0, 1.0, 2.0, 3.0]


def test_split_bbox_single_cell_returns_original_bbox() -> None:
    cells = split_bbox("1.45,48.12,3.56,49.24", cols=1, rows=1)
    assert cells == ["1.45,48.12,3.56,49.24"]


def test_split_bbox_2x1_grid_splits_on_longitude_only() -> None:
    cells = split_bbox("0,0,4,2", cols=2, rows=1)
    assert cells == ["0,0,2,2", "2,0,4,2"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_seed_idf_pois.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'seed_idf_pois'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```python
# backend/seed_idf_pois.py
def split_bbox(bbox: str, cols: int, rows: int) -> list[str]:
    lon1, lat1, lon2, lat2 = (float(p) for p in bbox.split(","))
    lon_step = (lon2 - lon1) / cols
    lat_step = (lat2 - lat1) / rows
    return [
        f"{lon1 + col * lon_step:g},{lat1 + row * lat_step:g},"
        f"{lon1 + (col + 1) * lon_step:g},{lat1 + (row + 1) * lat_step:g}"
        for row in range(rows)
        for col in range(cols)
    ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_seed_idf_pois.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/seed_idf_pois.py backend/tests/test_seed_idf_pois.py
git commit -m "feat: add split_bbox grid helper for the IDF POI seed script"
```

---

### Task 3: Seed script orchestration (`main()`)

**Files:**
- Modify: `backend/seed_idf_pois.py`

**Interfaces:**
- Consumes: `split_bbox(bbox, cols, rows) -> list[str]` (Task 2); `overpass.fetch_overpass_pois(client: httpx.AsyncClient, bbox: str) -> list[dict]` (existing — each dict has `lat`, `lon`, `name`, `group`, `source`, `osm_id`, `osm_type`); `poi_tiles.tile_for_point(lat: float, lon: float) -> tuple[int, int]` (existing); `poi_cache.create_pool(database_url: str | None) -> asyncpg.Pool | None` (existing); `poi_cache.upsert_tiles(pool: asyncpg.Pool | None, pois_by_tile: dict[tuple[int, int], list[dict]]) -> None` (existing).
- Produces: `IDF_BBOX: str` constant; a runnable `python backend/seed_idf_pois.py` CLI entrypoint.

No new automated test for this step — it's orchestration glue over already-tested functions (network + DB side effects), consistent with the design spec's testing section. Verification is manual (Step 3 below), against the local `db` service brought up in Task 4.

- [ ] **Step 1: Add the orchestration code**

Append to `backend/seed_idf_pois.py` (keep `split_bbox` above it):

```python
import asyncio
import os

import httpx

from overpass import fetch_overpass_pois
from poi_cache import create_pool, upsert_tiles
from poi_tiles import tile_for_point

IDF_BBOX = "1.45,48.12,3.56,49.24"


async def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit(
            "DATABASE_URL is not set — point it at the local dev Postgres "
            "(see README, section 'Peupler le cache POI local')."
        )

    pool = await create_pool(database_url)
    if pool is None:
        raise SystemExit(f"Could not connect to DATABASE_URL={database_url!r}")

    cells = split_bbox(IDF_BBOX, cols=3, rows=3)
    async with httpx.AsyncClient() as client:
        for i, cell in enumerate(cells, start=1):
            print(f"[{i}/{len(cells)}] fetching {cell}...")
            pois = await fetch_overpass_pois(client, cell)

            pois_by_tile: dict[tuple[int, int], list[dict]] = {}
            for poi in pois:
                tile = tile_for_point(poi["lat"], poi["lon"])
                pois_by_tile.setdefault(tile, []).append(poi)

            await upsert_tiles(pool, pois_by_tile)
            print(f"  -> {len(pois)} POIs across {len(pois_by_tile)} tiles")

    await pool.close()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
```

Note the import order: this puts stdlib (`asyncio`, `os`) → third-party (`httpx`) → local (`overpass`, `poi_cache`, `poi_tiles`) → the `IDF_BBOX` constant and function definitions, per project convention. `split_bbox` (Task 2) stays as the first thing in the file, so the final file order is: stdlib imports, third-party imports, local imports, `IDF_BBOX`, `split_bbox`, `main`.

- [ ] **Step 2: Sanity-check imports**

Run: `cd backend && python -c "import seed_idf_pois"`
Expected: no output, exit code 0 (confirms no syntax/import errors; `main()` itself isn't called).

- [ ] **Step 3: Manual smoke test (requires Task 4's `db` service running)**

This step is deferred to Task 4 Step 4, once the local Postgres service exists — running the seed script against a real DB is the actual verification for this task's `main()` logic.

- [ ] **Step 4: Commit**

```bash
git add backend/seed_idf_pois.py
git commit -m "feat: add IDF POI seed script orchestration (main())"
```

---

### Task 4: Local Postgres service in `docker-compose.yml`

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:** none (infra config).

- [ ] **Step 1: Add the `db` service and wire `backend`**

Current `docker-compose.yml`:

```yaml
services:
  backend:
    build: ./backend
    env_file: .env

  frontend:
    build: ./frontend
    ports:
      - "${PORT:-3000}:3000"
    depends_on:
      - backend
```

New version:

```yaml
services:
  backend:
    build: ./backend
    env_file: .env
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/postgres
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "${PORT:-3000}:3000"
    depends_on:
      - backend

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - poi_db_data:/var/lib/postgresql/data
      - ./supabase/migrations:/docker-entrypoint-initdb.d:ro
    ports:
      - "5432:5432"

volumes:
  poi_db_data:
```

- [ ] **Step 2: Start the `db` service fresh and confirm the migration ran**

Run: `docker compose down -v && docker compose up -d db && sleep 3`
(The `-v` drops any old `poi_db_data` volume so `/docker-entrypoint-initdb.d` actually runs — Postgres only runs init scripts on an empty data directory.)

Run: `docker compose exec db psql -U postgres -c '\d poi_cache_tiles'`
Expected: table description showing columns `tile_x`, `tile_y`, `pois`, `fetched_at` (matches `supabase/migrations/0001_poi_cache_tiles.sql`).

- [ ] **Step 3: Confirm the backend picks up the local `DATABASE_URL`**

Run: `docker compose up -d --build backend && sleep 2 && docker compose logs backend --tail 20`
Expected: no traceback (this also re-verifies Task 1's fix); uvicorn running.

- [ ] **Step 4: Run the seed script against the local `db` (completes Task 3's deferred verification)**

Run: `docker compose exec backend python seed_idf_pois.py`
Expected: 9 lines like `[1/9] fetching 1.45,48.12,2.15333,48.5867...` each followed by a `-> N POIs across M tiles` line, then `Done.`. This call goes out to the real public Overpass API — expect it to take a few minutes total (9 sequential regional queries); if any single cell errors, `fetch_overpass_pois` already degrades gracefully to `[]` for that cell (existing behavior, not new code), so the run continues rather than crashing.

Run: `docker compose exec db psql -U postgres -c 'select count(*) from poi_cache_tiles;'`
Expected: a nonzero count.

- [ ] **Step 5: Confirm `/pois` serves from the local cache without a live fetch**

Pick any lat/lon inside the IDF bbox (e.g. central Paris `2.35,48.85`) and a small bbox around it:

Run: `curl -s "http://localhost:8000/pois?bbox=2.340,48.845,2.360,48.855&groups=education,parks" -H "Authorization: Bearer <a valid dev JWT>"`
Expected: `200` with a `{"pois": [...]}` body — cross-check against Task 4 Step 4's tile count that this bbox's tiles were part of the seeded set (they fall inside `1.45,48.12,3.56,49.24`, cols=3/rows=3 grid, so yes). Getting a valid JWT for this manual curl isn't worth automating here — if `require_user_id` blocks the call, it's fine to instead verify via the browser at `http://localhost:3000/app` (already authenticated through the UI) and watch the Network tab for `/pois` responding fast with populated `pois` — either check confirms the same thing.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add local Postgres service for the POI cache in dev"
```

---

### Task 5: Docs and changelog

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:** none (docs/version only).

- [ ] **Step 1: Update README**

In `README.md`, replace this paragraph (currently right after `## Lancer le projet`'s docker command and the `Ouvrir http://localhost:3000...` paragraph):

```markdown
Pour activer le cache des points d'intérêt (recommandé, réduit fortement la
consommation du quota Geoapify) : appliquer la migration
`supabase/migrations/0001_poi_cache_tiles.sql` dans le SQL editor du projet
Supabase, puis renseigner `DATABASE_URL` dans `.env` avec la connection
string Postgres du pooler Supabase (Project Settings → Database →
Connection string). Sans `DATABASE_URL`, `/pois` continue de fonctionner
sans cache (comportement précédent).
```

with:

```markdown
Le cache des points d'intérêt (réduit fortement la consommation du quota
Geoapify) est activé par défaut en local : `docker compose up --build`
démarre aussi un Postgres local (`db`), avec la migration
`supabase/migrations/0001_poi_cache_tiles.sql` appliquée automatiquement au
premier démarrage. `DATABASE_URL` est déjà pointé dessus dans
`docker-compose.yml` — rien à configurer.

Pour peupler ce cache local avec les POI Overpass (OSM) de toute
l'Île-de-France, et développer `/pois` sans dépendre du réseau (Overpass,
Geoapify) ni du projet Supabase distant :

```bash
docker compose exec backend python seed_idf_pois.py
```

Hors Île-de-France, `/pois` continue de fonctionner normalement (fetch live
+ cache), sans changement. Le cache expire après 30 jours — relancer la
commande ci-dessus si besoin.

Hors Docker (ex. déploiement prod), pointer `DATABASE_URL` vers un Postgres
distant (ex. le pooler Supabase, Project Settings → Database → Connection
string) après y avoir appliqué la même migration. Sans `DATABASE_URL`,
`/pois` continue de fonctionner sans cache (comportement précédent).
```

- [ ] **Step 2: Update CHANGELOG**

In `CHANGELOG.md`, the file currently starts:

```markdown
## [Unreleased]

## [1.3.0] - 2026-08-04
```

Change to:

```markdown
## [Unreleased]

## [1.4.0] - 2026-08-04

### Added
- Service Postgres local dans `docker-compose.yml` (dev uniquement), avec
  la migration `poi_cache_tiles` appliquée automatiquement au premier
  démarrage — le cache POI est actif par défaut en local.
- `backend/seed_idf_pois.py` : script one-shot qui pré-remplit ce cache
  avec les POI Overpass (OSM) de toute l'Île-de-France, pour développer
  `/pois` sans dépendre du réseau ni du quota Geoapify. Hors Île-de-France,
  comportement inchangé (fetch live).

### Fixed
- `backend/Dockerfile` ne copiait que `main.py`, pas les autres modules
  (`overpass.py`, `poi_cache.py`, `poi_dedup.py`, `poi_tiles.py`) que
  `main.py` importe — le backend crashait au démarrage dans Docker.

## [1.3.0] - 2026-08-04
```

- [ ] **Step 3: Bump version**

Run: `cd frontend && npm pkg set version=1.4.0`

Then manually mirror the same change in `frontend/package-lock.json` (do not run `npm install --package-lock-only` — it pulls in unrelated optional-dependency lockfile churn, as happened during the 1.3.0 release): open the file and change the two `"version": "1.3.0"` occurrences at the top (root package `name`/`version` block, lines 2-3 and 8-9) to `"1.4.0"`.

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md frontend/package.json frontend/package-lock.json
git commit -m "docs: document local IDF POI cache, release 1.4.0"
```

---

### Task 6: Full test suite

**Files:** none (verification only).

- [ ] **Step 1: Run backend tests**

Run: `cd backend && python -m pytest -v`
Expected: all tests pass, including the 4 new `test_seed_idf_pois.py` tests from Task 2.

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npm run test`
Expected: all tests pass (this feature touches no frontend code, so this is a regression check, not expected to change anything).

- [ ] **Step 3: Run frontend typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint` (same two commands CI runs, per `.github/workflows`)
Expected: no errors.

- [ ] **Step 4: Tear down local Docker state used for manual verification**

Run: `docker compose down`

(Leaves the `poi_db_data` volume in place — a dev running this again later keeps the seeded cache instead of re-fetching from Overpass.)

No commit for this task — it's verification only, folding into the PR opened from the tasks above.
