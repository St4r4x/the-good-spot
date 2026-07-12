import httpx
import pytest
import respx

from main import GEOCODE_URL, ISOLINE_URL, PLACES_URL, ROUTING_URL, validate_mode

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
def test_zone_requires_auth(client) -> None:
    resp = client.get("/zone", params={"address": "Paris", "minutes": 15})
    assert resp.status_code == 401


@respx.mock
def test_zone_rejects_invalid_token(client) -> None:
    resp = client.get(
        "/zone",
        params={"address": "Paris", "minutes": 15},
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert resp.status_code == 401


@respx.mock
def test_zone_rejects_minutes_out_of_range(client, auth_headers) -> None:
    headers = auth_headers()
    resp = client.get(
        "/zone", params={"address": "Paris", "minutes": 0}, headers=headers
    )
    assert resp.status_code == 400

    resp = client.get(
        "/zone", params={"address": "Paris", "minutes": 61}, headers=headers
    )
    assert resp.status_code == 400


@respx.mock
def test_zone_rejects_unknown_mode(client, auth_headers) -> None:
    resp = client.get(
        "/zone",
        params={"address": "Paris", "minutes": 15, "mode": "teleport"},
        headers=auth_headers(),
    )
    assert resp.status_code == 400


@respx.mock
def test_zone_returns_404_for_unknown_address(client, auth_headers) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json={"features": []}))
    resp = client.get(
        "/zone",
        params={"address": "Nowhereville", "minutes": 15},
        headers=auth_headers(),
    )
    assert resp.status_code == 404


@respx.mock
def test_zone_happy_path(client, auth_headers) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json=GEOCODE_MATCH))
    respx.get(ISOLINE_URL).mock(
        return_value=httpx.Response(200, json={"features": [{"type": "Feature"}]})
    )

    resp = client.get(
        "/zone",
        params={"address": "Paris", "minutes": 15, "mode": "walk"},
        headers=auth_headers(),
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
def test_housing_requires_auth(client) -> None:
    resp = client.get(
        "/housing",
        params={
            "address": "Paris",
            "work1_lat": 48.85,
            "work1_lon": 2.35,
            "work2_lat": 48.86,
            "work2_lon": 2.36,
        },
    )
    assert resp.status_code == 401


@respx.mock
def test_housing_rejects_unknown_mode(client, auth_headers) -> None:
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
        headers=auth_headers(),
    )
    assert resp.status_code == 400


@respx.mock
def test_housing_happy_path(client, auth_headers) -> None:
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
        headers=auth_headers(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["time_to_work1_minutes"] == 15
    assert body["time_to_work2_minutes"] == 15

    routing_request = respx.calls.last.request
    assert routing_request.url.params["mode"] == "bicycle"


@respx.mock
def test_pois_requires_auth(client) -> None:
    resp = client.get("/pois", params={"bbox": "2.3,48.8,2.4,48.9", "groups": "sport"})
    assert resp.status_code == 401


@respx.mock
def test_pois_rejects_unknown_group(client, auth_headers) -> None:
    resp = client.get(
        "/pois",
        params={"bbox": "2.3,48.8,2.4,48.9", "groups": "not_a_group"},
        headers=auth_headers(),
    )
    assert resp.status_code == 400


@respx.mock
def test_pois_rejects_invalid_bbox(client, auth_headers) -> None:
    resp = client.get(
        "/pois",
        params={"bbox": "2.3,48.8,2.4", "groups": "sport"},
        headers=auth_headers(),
    )
    assert resp.status_code == 400


@respx.mock
def test_pois_happy_path(client, auth_headers) -> None:
    respx.get(PLACES_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    {
                        "properties": {
                            "name": "École Jules Ferry",
                            "categories": ["education", "education.school"],
                        },
                        "geometry": {"coordinates": [2.35, 48.85]},
                    },
                    {
                        "properties": {"categories": ["sport", "sport.pitch"]},
                        "geometry": {"coordinates": [2.36, 48.86]},
                    },
                ]
            },
        )
    )

    resp = client.get(
        "/pois",
        params={"bbox": "2.3,48.8,2.4,48.9", "groups": "education,sport"},
        headers=auth_headers(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["pois"]) == 2
    assert body["pois"][0] == {
        "lat": 48.85,
        "lon": 2.35,
        "name": "École Jules Ferry",
        "group": "education",
    }
    assert body["pois"][1] == {
        "lat": 48.86,
        "lon": 2.36,
        "name": None,
        "group": "sport",
    }

    request = respx.calls.last.request
    assert "education.school" in request.url.params["categories"]
    assert "sport.pitch" in request.url.params["categories"]
    assert request.url.params["filter"] == "rect:2.3,48.8,2.4,48.9"
    assert request.url.params["limit"] == "500"


def test_get_current_user_id_returns_none_without_header(client) -> None:
    from fastapi import Request
    from main import get_current_user_id

    scope = {"type": "http", "headers": []}
    request = Request(scope)
    assert get_current_user_id(request) is None


def test_get_current_user_id_returns_sub_for_valid_token(client, auth_headers) -> None:
    from fastapi import Request
    from main import get_current_user_id

    headers = auth_headers("22222222-2222-2222-2222-222222222222")
    scope = {
        "type": "http",
        "headers": [(b"authorization", headers["Authorization"].encode())],
    }
    request = Request(scope)
    assert get_current_user_id(request) == "22222222-2222-2222-2222-222222222222"


def test_get_current_user_id_returns_none_for_invalid_token() -> None:
    from fastapi import Request
    from main import get_current_user_id

    scope = {
        "type": "http",
        "headers": [(b"authorization", b"Bearer not-a-real-token")],
    }
    request = Request(scope)
    assert get_current_user_id(request) is None


@respx.mock
def test_zone_authenticated_requests_succeed(client, auth_headers) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json=GEOCODE_MATCH))
    respx.get(ISOLINE_URL).mock(
        return_value=httpx.Response(200, json={"features": [{"type": "Feature"}]})
    )
    headers = auth_headers()

    for _ in range(30):
        resp = client.get(
            "/zone",
            params={"address": "Paris", "minutes": 15, "mode": "walk"},
            headers=headers,
        )
        assert resp.status_code == 200


@respx.mock
def test_rate_limit_is_shared_across_endpoints(client, auth_headers) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json=GEOCODE_MATCH))
    respx.get(ISOLINE_URL).mock(
        return_value=httpx.Response(200, json={"features": [{"type": "Feature"}]})
    )
    respx.get(PLACES_URL).mock(return_value=httpx.Response(200, json={"features": []}))
    headers = auth_headers()

    for _ in range(150):
        resp = client.get(
            "/zone",
            params={"address": "Paris", "minutes": 15, "mode": "walk"},
            headers=headers,
        )
        assert resp.status_code == 200
    for _ in range(50):
        resp = client.get(
            "/pois",
            params={"bbox": "2.3,48.8,2.4,48.9", "groups": "sport"},
            headers=headers,
        )
        assert resp.status_code == 200

    resp = client.get(
        "/zone",
        params={"address": "Paris", "minutes": 15, "mode": "walk"},
        headers=headers,
    )
    assert resp.status_code == 429
