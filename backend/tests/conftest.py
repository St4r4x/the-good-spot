import os
import time
from dataclasses import dataclass

os.environ.setdefault("GEOAPIFY_API_KEY", "test-key")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

import main
from main import app, limiter

_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())


@dataclass
class _FakeSigningKey:
    key: ec.EllipticCurvePublicKey


class _FakeJwkClient:
    def get_signing_key_from_jwt(self, token: str) -> _FakeSigningKey:
        return _FakeSigningKey(_PRIVATE_KEY.public_key())


@pytest.fixture(autouse=True)
def _fake_jwk_client(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "_jwk_client", _FakeJwkClient())


@pytest.fixture
def client() -> TestClient:
    limiter.reset()
    return TestClient(app)


@pytest.fixture
def auth_headers():
    def _make(user_id: str = "11111111-1111-1111-1111-111111111111") -> dict[str, str]:
        token = jwt.encode(
            {
                "sub": user_id,
                "aud": "authenticated",
                "role": "authenticated",
                "exp": int(time.time()) + 3600,
            },
            _PRIVATE_KEY,
            algorithm="ES256",
        )
        return {"Authorization": f"Bearer {token}"}

    return _make


class _FakeCacheRecord(dict):
    pass


class _FakeCachePool:
    def __init__(self) -> None:
        self.rows: dict[tuple[int, int], dict] = {}

    def acquire(self):
        return _FakeCacheConnection(self)


class _FakeCacheConnection:
    def __init__(self, pool: _FakeCachePool) -> None:
        self._pool = pool

    async def __aenter__(self) -> "_FakeCacheConnection":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def fetch(self, query: str, tile_xs: list[int], tile_ys: list[int]):
        records = []
        for x, y in zip(tile_xs, tile_ys):
            row = self._pool.rows.get((x, y))
            if row is not None:
                records.append(
                    _FakeCacheRecord(
                        tile_x=x,
                        tile_y=y,
                        pois=row["pois"],
                        fetched_at=row["fetched_at"],
                    )
                )
        return records

    async def executemany(self, query: str, args: list[tuple]) -> None:
        for tile_x, tile_y, pois, fetched_at in args:
            self._pool.rows[(tile_x, tile_y)] = {"pois": pois, "fetched_at": fetched_at}


@pytest.fixture
def fake_pool(monkeypatch: pytest.MonkeyPatch) -> _FakeCachePool:
    pool = _FakeCachePool()
    monkeypatch.setattr(main, "_db_pool", pool)
    return pool
