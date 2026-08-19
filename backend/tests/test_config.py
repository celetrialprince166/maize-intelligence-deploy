"""Tests for app.config's fail-fast required-env-var behavior.

These are written first (red) against the current config.py, which still
has hardcoded fallback defaults — test_missing_required_env_var_raises must
fail until config.py is rewritten to require these vars with no fallback.
"""
import importlib

import pytest

from tests.conftest import reset_app_modules

REQUIRED_VARS = [
    "AWS_REGION",
    "S3_BUCKET",
    "DYNAMODB_FARMS_TABLE",
    "DYNAMODB_USERS_TABLE",
    "COGNITO_REGION",
    "COGNITO_USER_POOL_ID",
    "COGNITO_CLIENT_ID",
    "ALLOWED_ORIGINS",
    "GEE_SERVICE_ACCOUNT_KEY",
]


def _fresh_import():
    reset_app_modules()
    return importlib.import_module("app.config")


def test_config_loads_with_all_required_vars_set():
    config = _fresh_import()
    assert config.AWS_REGION == "us-east-1"
    assert config.S3_BUCKET == "test-maize-intelligence-models"
    assert config.DYNAMODB_FARMS_TABLE == "test-maize-intelligence-farms"
    assert config.DYNAMODB_USERS_TABLE == "test-maize-intelligence-users"
    assert config.COGNITO_USER_POOL_ID == "us-east-1_testpool"
    assert config.ALLOWED_ORIGINS == ["http://localhost:5174"]


@pytest.mark.parametrize("missing_var", REQUIRED_VARS)
def test_missing_required_env_var_raises(monkeypatch, missing_var):
    monkeypatch.delenv(missing_var, raising=False)
    with pytest.raises(RuntimeError, match=missing_var):
        _fresh_import()


def test_allowed_origins_parses_comma_separated_list(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.example.com, https://b.example.com")
    config = _fresh_import()
    assert config.ALLOWED_ORIGINS == ["https://a.example.com", "https://b.example.com"]


def test_static_constants_are_not_env_driven():
    """FEATURE_COLUMNS etc. are the same across every environment and must
    stay as plain constants — this is not a hardcoded-value violation."""
    config = _fresh_import()
    assert config.FEATURE_COLUMNS[0] == "NDVI"
    assert config.STAC_URL.startswith("https://")
