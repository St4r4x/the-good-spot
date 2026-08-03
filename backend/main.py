import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from limits import parse as parse_rate_limit
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.wrappers import Limit

from overpass import fetch_overpass_pois
from poi_cache import create_pool, get_cached_tiles, upsert_tiles
from poi_dedup import dedupe_pois
from poi_tiles import bbox_to_tiles, tile_for_point, tiles_bbox

load_dotenv()

GEOAPIFY_API_KEY = os.environ["GEOAPIFY_API_KEY"]
GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search"
ISOLINE_URL = "https://api.geoapify.com/v1/isoline"
ROUTING_URL = "https://api.geoapify.com/v1/routing"
PLACES_URL = "https://api.geoapify.com/v2/places"
MAX_MINUTES = 60
TRAVEL_MODES = {"transit", "walk", "bicycle", "drive"}

SUPABASE_URL = os.environ.get("SUPABASE_URL")
RATE_LIMIT = "200/day"

DATABASE_URL = os.environ.get("DATABASE_URL")
_db_pool = None

_jwk_client = (
    jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json")
    if SUPABASE_URL
    else None
)

POI_GROUPS: dict[str, list[str]] = {
    "education": [
        "education.school",
        "childcare.kindergarten",
        "education.music_school",
    ],
    "sport": [
        "sport.fitness",
        "sport.pitch",
        "sport.sports_centre",
        "sport.horse_riding",
        "activity.sport_club",
    ],
    "commerce": [
        "commercial.supermarket",
        "commercial.convenience",
        "commercial.food_and_drink",
        "commercial.marketplace",
    ],
    "health": [
        "healthcare.hospital",
        "healthcare.clinic_or_praxis",
        "healthcare.pharmacy",
    ],
    "parks": ["leisure.park", "leisure.playground"],
    "catering": ["catering.restaurant", "catering.cafe", "catering.bar"],
    "public_transport": ["public_transport"],
    "culture": [
        "entertainment.culture",
        "entertainment.museum",
        "entertainment.cinema",
        "tourism.sights",
    ],
}


def get_current_user_id(request: Request) -> str | None:
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer ") or not _jwk_client:
        return None
    token = auth_header.removeprefix("Bearer ")
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token, signing_key.key, algorithms=["ES256"], audience="authenticated"
        )
    except jwt.PyJWTError:
        return None
    return payload.get("sub")


def require_user_id(request: Request) -> str:
    user_id = get_current_user_id(request)
    if user_id is None:
        raise HTTPException(401, "Authentification requise.")
    return user_id


def rate_limit_key(request: Request) -> str:
    # require_user_id (dépendance FastAPI déclarée sur chaque endpoint) a déjà
    # rejeté avec 401 toute requête sans JWT valide avant que ce code ne
    # s'exécute — user_id est donc toujours présent ici.
    return f"user:{get_current_user_id(request)}"


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _db_pool
    _db_pool = await create_pool(DATABASE_URL)
    yield


limiter = Limiter(key_func=rate_limit_key)
app = FastAPI(lifespan=_lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Mirrors the Limit slowapi builds internally for
# @limiter.shared_limit(RATE_LIMIT, scope="geoapify") (used on /zone and
# /housing below) so a manual hit() in /pois can raise the identical
# RateLimitExceeded — same {"error": ...} body and X-RateLimit-* headers —
# instead of a bare HTTPException with a different shape.
_geoapify_limit = Limit(
    parse_rate_limit(RATE_LIMIT),
    rate_limit_key,
    "geoapify",
    False,
    None,
    None,
    None,
    1,
    True,
)


async def geocode(client: httpx.AsyncClient, address: str) -> dict:
    resp = await client.get(
        GEOCODE_URL, params={"text": address, "apiKey": GEOAPIFY_API_KEY}
    )
    resp.raise_for_status()
    features = resp.json()["features"]
    if not features:
        raise HTTPException(404, f"Adresse introuvable : {address}")
    return features[0]


async def travel_time_seconds(
    client: httpx.AsyncClient,
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
    mode: str,
) -> int:
    resp = await client.get(
        ROUTING_URL,
        params={
            "waypoints": f"{from_lat},{from_lon}|{to_lat},{to_lon}",
            "mode": mode,
            "apiKey": GEOAPIFY_API_KEY,
        },
    )
    resp.raise_for_status()
    return resp.json()["features"][0]["properties"]["time"]


def validate_mode(mode: str) -> None:
    if mode not in TRAVEL_MODES:
        raise HTTPException(400, f"mode doit être l'un de {sorted(TRAVEL_MODES)}")


def validate_groups(groups: list[str]) -> None:
    unknown = set(groups) - POI_GROUPS.keys()
    if unknown:
        raise HTTPException(400, f"groups inconnu(s) : {sorted(unknown)}")


def parse_bbox(bbox: str) -> str:
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(400, "bbox doit contenir 4 valeurs : lon1,lat1,lon2,lat2")
    try:
        [float(p) for p in parts]
    except ValueError as exc:
        raise HTTPException(400, "bbox doit contenir des nombres") from exc
    return bbox


def group_for_categories(categories: list[str], groups: list[str]) -> str | None:
    # Iterate POI_GROUPS' canonical (insertion) order, not the client-supplied
    # `groups` order, so a category overlapping two groups always resolves the
    # same way regardless of how the frontend ordered its query param.
    for group in POI_GROUPS:
        if group in groups and any(cat in categories for cat in POI_GROUPS[group]):
            return group
    return None


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


@app.get("/zone")
@limiter.shared_limit(RATE_LIMIT, scope="geoapify")
async def zone(
    request: Request,
    address: str,
    minutes: int,
    mode: str = "transit",
    _user_id: str = Depends(require_user_id),
) -> dict:
    if minutes <= 0 or minutes > MAX_MINUTES:
        raise HTTPException(400, f"minutes doit être entre 1 et {MAX_MINUTES}")
    validate_mode(mode)

    async with httpx.AsyncClient(timeout=30) as client:
        match = await geocode(client, address)
        lon, lat = match["geometry"]["coordinates"]

        isoline_resp = await client.get(
            ISOLINE_URL,
            params={
                "lat": lat,
                "lon": lon,
                "type": "time",
                "mode": mode,
                "range": minutes * 60,
                "apiKey": GEOAPIFY_API_KEY,
            },
        )
        isoline_resp.raise_for_status()
        return {
            "resolved_address": match["properties"]["formatted"],
            "lat": lat,
            "lon": lon,
            "isochrone": isoline_resp.json(),
        }


@app.get("/housing")
@limiter.shared_limit(RATE_LIMIT, scope="geoapify")
async def housing(
    request: Request,
    address: str,
    work1_lat: float,
    work1_lon: float,
    work2_lat: float,
    work2_lon: float,
    mode: str = "transit",
    _user_id: str = Depends(require_user_id),
) -> dict:
    validate_mode(mode)
    async with httpx.AsyncClient(timeout=30) as client:
        match = await geocode(client, address)
        lon, lat = match["geometry"]["coordinates"]

        time1, time2 = await asyncio.gather(
            travel_time_seconds(client, lat, lon, work1_lat, work1_lon, mode),
            travel_time_seconds(client, lat, lon, work2_lat, work2_lon, mode),
        )
        return {
            "resolved_address": match["properties"]["formatted"],
            "lat": lat,
            "lon": lon,
            "time_to_work1_minutes": round(time1 / 60),
            "time_to_work2_minutes": round(time2 / 60),
        }


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
            geoapify_resp, overpass_pois = await asyncio.gather(
                geoapify_task, overpass_task
            )

        geoapify_resp.raise_for_status()
        # limiter.limiter.hit() only increments the counter and reports
        # whether it stayed within budget — unlike the @limiter.shared_limit
        # decorator used on /zone and /housing, nothing here raises on our
        # behalf, so we check the result and raise ourselves, mirroring
        # slowapi's own Limiter.__evaluate_limits (same check-then-raise,
        # same request.state.view_rate_limit bookkeeping for header
        # injection) so a quota trip here looks identical to one on /zone
        # or /housing.
        limit_key = rate_limit_key(request)
        request.state.view_rate_limit = (_geoapify_limit.limit, [limit_key, "geoapify"])
        if not limiter.limiter.hit(_geoapify_limit.limit, limit_key, "geoapify"):
            raise RateLimitExceeded(_geoapify_limit)

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

        # Only the POIs actually bucketed into a missing tile belong in the
        # response here — fresh_pois itself is drawn from fetch_bbox, which
        # is the bounding rectangle of all missing tiles and can therefore
        # re-cover already-cached tiles too (when misses are non-contiguous).
        # Extending with fresh_pois directly would double-count any POI that
        # falls inside one of those already-cached tiles (once from `cached`,
        # once here). pois_by_tile has already filtered to just the missing
        # tiles, so reuse it instead of recomputing anything.
        all_pois.extend(poi for tile_pois in pois_by_tile.values() for poi in tile_pois)

    bbox_lon1, bbox_lat1, bbox_lon2, bbox_lat2 = (
        float(p) for p in validated_bbox.split(",")
    )
    min_lon, max_lon = sorted((bbox_lon1, bbox_lon2))
    min_lat, max_lat = sorted((bbox_lat1, bbox_lat2))

    results = [
        {
            "lat": poi["lat"],
            "lon": poi["lon"],
            "name": poi["name"],
            "group": poi["group"],
        }
        for poi in all_pois
        if poi["group"] in group_list
        and min_lon <= poi["lon"] <= max_lon
        and min_lat <= poi["lat"] <= max_lat
    ]
    return {"pois": results}
