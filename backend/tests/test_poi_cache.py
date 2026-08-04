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
                        tile_x=x,
                        tile_y=y,
                        pois=row["pois"],
                        fetched_at=row["fetched_at"],
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
    pois_by_tile = {
        (1, 1): [{"lat": 48.85, "lon": 2.35, "name": "X", "group": "health"}]
    }
    await upsert_tiles(pool, pois_by_tile)

    result = await get_cached_tiles(pool, [(1, 1)])
    assert result == {(1, 1): pois_by_tile[(1, 1)]}


@pytest.mark.asyncio
async def test_get_cached_tiles_treats_expired_tile_as_miss() -> None:
    pool = _FakePool()
    stale = datetime.now(timezone.utc) - timedelta(days=31)
    pool.rows[(1, 1)] = {
        "pois": [{"lat": 1, "lon": 1, "name": None, "group": "parks"}],
        "fetched_at": stale,
    }

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
