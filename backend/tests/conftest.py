"""Shared pytest fixtures for the backend test suite.

Provides the full set of required environment variables so that importing
`app.config` (and everything that depends on it) succeeds by default. Tests
for the fail-fast behavior itself remove specific variables and reload the
module in isolation instead of relying on this fixture.
"""
import importlib
import os
import sys

import pytest

REQUIRED_ENV = {
    "AWS_REGION": "us-east-1",
    "S3_BUCKET": "test-maize-intelligence-models",
    "DYNAMODB_FARMS_TABLE": "test-maize-intelligence-farms",
    "DYNAMODB_USERS_TABLE": "test-maize-intelligence-users",
    "COGNITO_REGION": "us-east-1",
    "COGNITO_USER_POOL_ID": "us-east-1_testpool",
    "COGNITO_CLIENT_ID": "test-client-id",
    "ALLOWED_ORIGINS": "http://localhost:5174",
    "GEE_SERVICE_ACCOUNT_KEY": "/tmp/test-gee-key.json",
}


def reset_app_modules() -> None:
    """Remove every `app`/`app.*` module from sys.modules so the next
    import re-executes them against the current environment.

    Popping sys.modules alone is not enough: `from . import config`
    resolves via `hasattr(app_package, "config")` first, and that
    attribute survives on the `app` package object even after
    `sys.modules.pop("app.config")` — so a stale config module gets
    silently reused unless the `app` package module itself is also
    removed. This is the single place that reset logic lives; tests
    should call this instead of re-implementing their own pop loop.
    """
    for mod_name in list(sys.modules):
        if mod_name == "app" or mod_name.startswith("app."):
            sys.modules.pop(mod_name, None)


@pytest.fixture(autouse=True)
def required_env(monkeypatch):
    """Set every required config env var before each test, then reset
    imported app modules so they pick up the test values rather than a
    stale import from a previous test."""
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    reset_app_modules()
    yield
