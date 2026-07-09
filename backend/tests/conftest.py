import os

os.environ.setdefault("GEOAPIFY_API_KEY", "test-key")

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
