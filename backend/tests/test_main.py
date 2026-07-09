import httpx
import pytest
import respx

from main import GEOCODE_URL, ISOLINE_URL, ROUTING_URL, validate_mode

GEOCODE_MATCH = {
    "features": [
        {
            "geometry": {"coordinates": [2.3522, 48.8566]},
            "properties": {"formatted": "Paris, France"},
        }
    ]
}


def test_validate_mode_accepts_known_modes() -> None:
    for mode in ["transit", "walk", "bicycle", "drive"]:
        validate_mode(mode)


def test_validate_mode_rejects_unknown_mode() -> None:
    with pytest.raises(Exception):
        validate_mode("teleport")


@respx.mock
def test_isochrone_rejects_minutes_out_of_range(client) -> None:
    resp = client.get("/isochrone", params={"address": "Paris", "minutes": 0})
    assert resp.status_code == 400

    resp = client.get("/isochrone", params={"address": "Paris", "minutes": 61})
    assert resp.status_code == 400


@respx.mock
def test_isochrone_rejects_unknown_mode(client) -> None:
    resp = client.get(
        "/isochrone", params={"address": "Paris", "minutes": 15, "mode": "teleport"}
    )
    assert resp.status_code == 400


@respx.mock
def test_isochrone_returns_404_for_unknown_address(client) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json={"features": []}))
    resp = client.get("/isochrone", params={"address": "Nowhereville", "minutes": 15})
    assert resp.status_code == 404


@respx.mock
def test_isochrone_happy_path(client) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json=GEOCODE_MATCH))
    respx.get(ISOLINE_URL).mock(
        return_value=httpx.Response(200, json={"features": [{"type": "Feature"}]})
    )

    resp = client.get(
        "/isochrone", params={"address": "Paris", "minutes": 15, "mode": "walk"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["resolved_address"] == "Paris, France"
    assert body["lat"] == 48.8566
    assert body["lon"] == 2.3522
    assert body["isochrone"]["features"][0]["type"] == "Feature"

    isoline_request = respx.calls.last.request
    assert isoline_request.url.params["mode"] == "walk"
    assert isoline_request.url.params["range"] == "900"


@respx.mock
def test_housing_rejects_unknown_mode(client) -> None:
    resp = client.get(
        "/housing",
        params={
            "address": "Paris",
            "work1_lat": 48.85,
            "work1_lon": 2.35,
            "work2_lat": 48.86,
            "work2_lon": 2.36,
            "mode": "teleport",
        },
    )
    assert resp.status_code == 400


@respx.mock
def test_housing_happy_path(client) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json=GEOCODE_MATCH))
    respx.get(ROUTING_URL).mock(
        return_value=httpx.Response(
            200, json={"features": [{"properties": {"time": 900}}]}
        )
    )

    resp = client.get(
        "/housing",
        params={
            "address": "Paris",
            "work1_lat": 48.85,
            "work1_lon": 2.35,
            "work2_lat": 48.86,
            "work2_lon": 2.36,
            "mode": "bicycle",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["time_to_work1_minutes"] == 15
    assert body["time_to_work2_minutes"] == 15

    routing_request = respx.calls.last.request
    assert routing_request.url.params["mode"] == "bicycle"
