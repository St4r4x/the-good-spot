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
