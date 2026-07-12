import os

os.environ.setdefault("GEOAPIFY_API_KEY", "test-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret")

import pytest
from fastapi.testclient import TestClient

from main import app, limiter


@pytest.fixture
def client() -> TestClient:
    limiter.reset()
    return TestClient(app)


@pytest.fixture
def auth_headers():
    import time

    import jwt

    def _make(user_id: str = "11111111-1111-1111-1111-111111111111") -> dict[str, str]:
        token = jwt.encode(
            {
                "sub": user_id,
                "aud": "authenticated",
                "role": "authenticated",
                "exp": int(time.time()) + 3600,
            },
            os.environ["SUPABASE_JWT_SECRET"],
            algorithm="HS256",
        )
        return {"Authorization": f"Bearer {token}"}

    return _make
