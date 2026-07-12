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
