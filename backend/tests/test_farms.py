"""Tests for app.farms against a moto-mocked DynamoDB table.

Written to exercise the real boto3 call shapes (table creation, query,
update expressions) rather than mocking _get_table() itself — this would
catch a bad KeyConditionExpression or a missing table/GSI, which a
function-level mock would not.
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
def farms_module(monkeypatch):
    with mock_aws():
        config = _fresh_import("app.config")
        dynamodb = boto3.resource("dynamodb", region_name=config.AWS_REGION)
        dynamodb.create_table(
            TableName=config.DYNAMODB_FARMS_TABLE,
            KeySchema=[
                {"AttributeName": "userId", "KeyType": "HASH"},
                {"AttributeName": "farmId", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "userId", "AttributeType": "S"},
                {"AttributeName": "farmId", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        farms = _fresh_import("app.farms")
        yield farms


SQUARE_COORDS = [[9.40, -0.80], [9.40, -0.79], [9.41, -0.79], [9.41, -0.80]]


def test_create_and_get_farm(farms_module):
    from app.farms import FarmCreateRequest

    created = farms_module.create_farm(
        "user-1", FarmCreateRequest(name="Test Farm", coordinates=SQUARE_COORDS)
    )
    assert created["userId"] == "user-1"
    assert created["name"] == "Test Farm"
    assert created["area"] > 0

    fetched = farms_module.get_farm("user-1", created["farmId"])
    assert fetched == created


def test_get_farm_not_found_raises_404(farms_module):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        farms_module.get_farm("user-1", "does-not-exist")
    assert exc_info.value.status_code == 404


def test_list_farms_scoped_to_user(farms_module):
    from app.farms import FarmCreateRequest

    farms_module.create_farm("user-1", FarmCreateRequest(coordinates=SQUARE_COORDS))
    farms_module.create_farm("user-2", FarmCreateRequest(coordinates=SQUARE_COORDS))

    user1_farms = farms_module.list_farms("user-1")
    assert len(user1_farms) == 1
    assert user1_farms[0]["userId"] == "user-1"


def test_validate_geometry_rejects_fewer_than_three_points(farms_module):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        farms_module._validate_geometry([[9.40, -0.80], [9.41, -0.79]])
    assert exc_info.value.status_code == 400


def test_update_farm_status(farms_module):
    from app.farms import FarmCreateRequest, FarmUpdateRequest

    created = farms_module.create_farm(
        "user-1", FarmCreateRequest(coordinates=SQUARE_COORDS)
    )
    updated = farms_module.update_farm(
        "user-1", created["farmId"], FarmUpdateRequest(status="maize")
    )
    assert updated["status"] == "maize"


def test_delete_farm(farms_module):
    from fastapi import HTTPException

    from app.farms import FarmCreateRequest

    created = farms_module.create_farm(
        "user-1", FarmCreateRequest(coordinates=SQUARE_COORDS)
    )
    farms_module.delete_farm("user-1", created["farmId"])
    with pytest.raises(HTTPException):
        farms_module.get_farm("user-1", created["farmId"])
