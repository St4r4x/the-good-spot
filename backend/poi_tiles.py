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
        (x, y) for x in range(x_start, x_end + 1) for y in range(y_start, y_end + 1)
    ]


def tiles_bbox(tiles: list[tuple[int, int]]) -> str:
    xs = [t[0] for t in tiles]
    ys = [t[1] for t in tiles]
    lon1 = min(xs) * TILE_SIZE_DEG
    lat1 = min(ys) * TILE_SIZE_DEG
    lon2 = (max(xs) + 1) * TILE_SIZE_DEG
    lat2 = (max(ys) + 1) * TILE_SIZE_DEG
    return f"{lon1:g},{lat1:g},{lon2:g},{lat2:g}"
