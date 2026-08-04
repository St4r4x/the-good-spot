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
        filters.append(f"node{tag_filter}({bbox_clause});")
        filters.append(f"way{tag_filter}({bbox_clause});")
    return f"[out:json][timeout:25];({''.join(filters)});out center;"


def _group_for_tags(tags: dict[str, str]) -> str | None:
    # Iterate the canonical OVERPASS_GROUPS order (via _TAG_TO_GROUP, which
    # preserves it), not tags.items(), so an element matching two groups at
    # once resolves deterministically regardless of JSON/dict key order.
    for (key, value), group in _TAG_TO_GROUP.items():
        if tags.get(key) == value or (value == "" and key in tags):
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
