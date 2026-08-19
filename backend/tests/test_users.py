"""Tests for app.users against a moto-mocked DynamoDB table, including the
real `email-index` GSI that get_user_by_email depends on. A test that mocked
_get_table() instead of real DynamoDB would not catch a missing/misconfigured
GSI — this creates the table with the GSI exactly as Terraform must.
"""
import importlib

import boto3
import pytest
from moto import mock_aws

from tests.conftest import reset_app_modules


def _fresh_import(module_name):
    reset_app_modules()
    return importlib.import_module(module_name)


@pytest.fixture
def users_module():
    with mock_aws():
        config = _fresh_import("app.config")
        dynamodb = boto3.resource("dynamodb", region_name=config.AWS_REGION)
        dynamodb.create_table(
            TableName=config.DYNAMODB_USERS_TABLE,
            KeySchema=[{"AttributeName": "userId", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "userId", "AttributeType": "S"},
                {"AttributeName": "email", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "email-index",
                    "KeySchema": [{"AttributeName": "email", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        users = _fresh_import("app.users")
        yield users


def test_create_and_get_user_profile(users_module):
    created = users_module.create_user_profile(
        "cognito-sub-1", "farmer@example.com", "Kofi Mensah"
    )
    assert created["email"] == "farmer@example.com"

    fetched = users_module.get_user_profile("cognito-sub-1")
    assert fetched["name"] == "Kofi Mensah"


def test_get_user_by_email_uses_gsi(users_module):
    users_module.create_user_profile("cognito-sub-1", "farmer@example.com", "Kofi Mensah")

    found = users_module.get_user_by_email("farmer@example.com")
    assert found is not None
    assert found["userId"] == "cognito-sub-1"


def test_get_user_by_email_returns_none_when_absent(users_module):
    assert users_module.get_user_by_email("nobody@example.com") is None


def test_update_user_profile_only_touches_allowed_fields(users_module):
    users_module.create_user_profile("cognito-sub-1", "farmer@example.com", "Kofi Mensah")
    updated = users_module.update_user_profile(
        "cognito-sub-1", {"organization": "BigDataGhana", "email": "should-be-ignored@example.com"}
    )
    assert updated["organization"] == "BigDataGhana"
    assert updated["email"] == "farmer@example.com"


def test_record_login_updates_timestamp(users_module):
    users_module.create_user_profile("cognito-sub-1", "farmer@example.com", "Kofi Mensah")
    before = users_module.get_user_profile("cognito-sub-1")["lastLogin"]

    users_module.record_login("cognito-sub-1")

    after = users_module.get_user_profile("cognito-sub-1")["lastLogin"]
    assert after >= before
