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
        type_a, type_b = poi_a["osm_type"], poi_b["osm_type"]
        if type_a is None or type_b is None:
            return False
        # Geoapify reports osm_type as "n"/"w"/"r"; Overpass reports the full
        # word "node"/"way"/"relation". Compare on the first letter so the
        # same real-world OSM element matches across sources regardless of
        # which API's format it came from.
        return poi_a["osm_id"] == poi_b["osm_id"] and type_a[:1].lower() == type_b[:1].lower()

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
        elif (
            poi["source"] == "geoapify"
            and kept[duplicate_index]["source"] != "geoapify"
        ):
            kept[duplicate_index] = poi
    return kept
