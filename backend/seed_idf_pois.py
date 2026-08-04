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
