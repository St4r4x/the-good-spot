import httpx
import pytest
import respx

from overpass import OVERPASS_URL, fetch_overpass_pois

OVERPASS_RESPONSE = {
    "elements": [
        {
            "type": "node",
            "id": 603506496,
            "lat": 48.8591061,
            "lon": 2.3538958,
            "tags": {"amenity": "pharmacy", "name": "Pharmacie du Village"},
        },
        {
            "type": "way",
            "id": 12345,
            "center": {"lat": 48.86, "lon": 2.36},
            "tags": {"leisure": "pitch"},
        },
    ]
}


@pytest.mark.asyncio
@respx.mock
async def test_fetch_overpass_pois_maps_tags_to_groups() -> None:
    route = respx.post(OVERPASS_URL).mock(
        return_value=httpx.Response(200, json=OVERPASS_RESPONSE)
    )
    async with httpx.AsyncClient() as client:
        result = await fetch_overpass_pois(client, "2.30,48.80,2.40,48.90")

    assert len(result) == 2
    assert route.calls.last.request.headers["user-agent"] == "the-good-spot-dev (github.com/St4r4x/the-good-spot)"
    pharmacy = next(p for p in result if p["osm_id"] == 603506496)
    assert pharmacy == {
        "lat": 48.8591061,
        "lon": 2.3538958,
        "name": "Pharmacie du Village",
        "group": "health",
        "source": "overpass",
        "osm_id": 603506496,
        "osm_type": "node",
    }
    pitch = next(p for p in result if p["osm_id"] == 12345)
    assert pitch["group"] == "sport"
    assert pitch["lat"] == 48.86 and pitch["lon"] == 2.36
    assert pitch["name"] is None


@pytest.mark.asyncio
@respx.mock
async def test_fetch_overpass_pois_returns_none_on_timeout() -> None:
    respx.post(OVERPASS_URL).mock(side_effect=httpx.TimeoutException("timed out"))
    async with httpx.AsyncClient() as client:
        result = await fetch_overpass_pois(client, "2.30,48.80,2.40,48.90")
    assert result is None


@pytest.mark.asyncio
@respx.mock
async def test_fetch_overpass_pois_returns_none_on_http_error() -> None:
    respx.post(OVERPASS_URL).mock(
        return_value=httpx.Response(500, text="server too busy")
    )
    async with httpx.AsyncClient() as client:
        result = await fetch_overpass_pois(client, "2.30,48.80,2.40,48.90")
    assert result is None


@pytest.mark.asyncio
@respx.mock
async def test_fetch_overpass_pois_returns_none_on_invalid_json() -> None:
    respx.post(OVERPASS_URL).mock(
        return_value=httpx.Response(200, text="<html>not json</html>")
    )
    async with httpx.AsyncClient() as client:
        result = await fetch_overpass_pois(client, "2.30,48.80,2.40,48.90")
    assert result is None
