import asyncio
import os

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

load_dotenv()

GEOAPIFY_API_KEY = os.environ["GEOAPIFY_API_KEY"]
GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search"
ISOLINE_URL = "https://api.geoapify.com/v1/isoline"
ROUTING_URL = "https://api.geoapify.com/v1/routing"
MAX_MINUTES = 60
TRAVEL_MODES = {"transit", "walk", "bicycle", "drive"}

app = FastAPI()


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


@app.get("/isochrone")
async def isochrone(address: str, minutes: int, mode: str = "transit") -> dict:
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
async def housing(
    address: str,
    work1_lat: float,
    work1_lon: float,
    work2_lat: float,
    work2_lon: float,
    mode: str = "transit",
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
