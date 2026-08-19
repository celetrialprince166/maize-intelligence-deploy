"""Confirms CORS is driven by config.ALLOWED_ORIGINS, not a wildcard, and
actually reflects the Origin header only for allow-listed origins."""
import importlib

import pytest
from fastapi.testclient import TestClient

from tests.conftest import reset_app_modules


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://allowed.example.com")
    reset_app_modules()
    main = importlib.import_module("app.main")
    return TestClient(main.app)


def test_allowed_origin_is_reflected(client):
    resp = client.get("/health", headers={"Origin": "https://allowed.example.com"})
    assert resp.headers.get("access-control-allow-origin") == "https://allowed.example.com"


def test_disallowed_origin_is_not_reflected(client):
    resp = client.get("/health", headers={"Origin": "https://evil.example.com"})
    assert "access-control-allow-origin" not in {k.lower() for k in resp.headers.keys()} or \
        resp.headers.get("access-control-allow-origin") != "https://evil.example.com"


def test_no_wildcard_cors_configured():
    from app.main import app

    cors_middleware = next(
        m for m in app.user_middleware if m.cls.__name__ == "CORSMiddleware"
    )
    assert "*" not in cors_middleware.kwargs["allow_origins"]
