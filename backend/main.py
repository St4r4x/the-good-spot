import asyncio
import os

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()

GEOAPIFY_API_KEY = os.environ["GEOAPIFY_API_KEY"]
GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search"
ISOLINE_URL = "https://api.geoapify.com/v1/isoline"
ROUTING_URL = "https://api.geoapify.com/v1/routing"
PLACES_URL = "https://api.geoapify.com/v2/places"
MAX_MINUTES = 60
TRAVEL_MODES = {"transit", "walk", "bicycle", "drive"}

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
RATE_LIMIT = "200/day"

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
    if (
        not auth_header
        or not auth_header.startswith("Bearer ")
        or not SUPABASE_JWT_SECRET
    ):
        return None
    token = auth_header.removeprefix("Bearer ")
    try:
        payload = jwt.decode(
            token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated"
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


limiter = Limiter(key_func=rate_limit_key)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


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
@limiter.shared_limit(RATE_LIMIT, scope="geoapify")
async def pois(
    request: Request, bbox: str, groups: str, _user_id: str = Depends(require_user_id)
) -> dict:
    validated_bbox = parse_bbox(bbox)
    group_list = groups.split(",")
    validate_groups(group_list)
    categories = ",".join(cat for g in group_list for cat in POI_GROUPS[g])

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            PLACES_URL,
            params={
                "categories": categories,
                "filter": f"rect:{validated_bbox}",
                "limit": 500,
                "apiKey": GEOAPIFY_API_KEY,
            },
        )
        resp.raise_for_status()
        results = []
        for feature in resp.json()["features"]:
            props = feature["properties"]
            group = group_for_categories(props.get("categories", []), group_list)
            if group is None:
                continue
            lon, lat = feature["geometry"]["coordinates"]
            results.append(
                {"lat": lat, "lon": lon, "name": props.get("name"), "group": group}
            )
        return {"pois": results}
