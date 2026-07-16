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
