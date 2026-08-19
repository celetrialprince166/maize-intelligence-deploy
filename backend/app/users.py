"""User profile management backed by DynamoDB.

Cognito handles authentication (signup, login, tokens).
This module handles the user profile data that Cognito doesn't store:
organization, role, preferences, farm history, etc.
"""
import logging
import uuid
from datetime import datetime
from typing import Optional

import boto3
from boto3.dynamodb.conditions import Key
from fastapi import HTTPException

from . import config

logger = logging.getLogger(__name__)

_dynamodb = None


def _get_table():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name=config.AWS_REGION)
    return _dynamodb.Table(config.DYNAMODB_USERS_TABLE)


def create_user_profile(
    cognito_user_id: str,
    email: str,
    name: str,
    organization: Optional[str] = None,
    role: str = "analyst",
) -> dict:
    """Create a new user profile after Cognito signup."""
    table = _get_table()
    now = datetime.utcnow().isoformat()
    item = {
        "userId": cognito_user_id,
        "email": email,
        "name": name,
        "organization": organization or "",
        "role": role,
        "createdAt": now,
        "updatedAt": now,
        "preferences": {
            "defaultSeason": 2023,
            "mapStyle": "dark",
            "notifications": True,
        },
        "farmCount": 0,
        "lastLogin": now,
    }
    try:
        table.put_item(Item=item)
    except Exception as exc:
        logger.error("DynamoDB put_item failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")
    logger.info("Created user profile for %s (%s)", email, cognito_user_id)
    return item


def get_user_profile(user_id: str) -> Optional[dict]:
    """Get a user profile by Cognito user ID."""
    table = _get_table()
    try:
        resp = table.get_item(Key={"userId": user_id})
    except Exception as exc:
        logger.error("DynamoDB get_item failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")
    return resp.get("Item")


def get_user_by_email(email: str) -> Optional[dict]:
    """Look up a user profile by email (via GSI)."""
    table = _get_table()
    try:
        resp = table.query(
            IndexName="email-index",
            KeyConditionExpression=Key("email").eq(email),
            Limit=1,
        )
    except Exception as exc:
        logger.error("DynamoDB query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")
    items = resp.get("Items", [])
    return items[0] if items else None


def update_user_profile(user_id: str, updates: dict) -> Optional[dict]:
    """Update user profile fields."""
    table = _get_table()
    # Build update expression dynamically
    allowed = {"name", "organization", "role", "preferences", "mapStyle"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        return get_user_profile(user_id)

    filtered["updatedAt"] = datetime.utcnow().isoformat()

    expr_parts = []
    expr_names = {}
    expr_values = {}
    for i, (key, val) in enumerate(filtered.items()):
        alias = f"#k{i}"
        placeholder = f":v{i}"
        expr_parts.append(f"{alias} = {placeholder}")
        expr_names[alias] = key
        expr_values[placeholder] = val

    try:
        resp = table.update_item(
            Key={"userId": user_id},
            UpdateExpression="SET " + ", ".join(expr_parts),
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ReturnValues="ALL_NEW",
        )
    except Exception as exc:
        logger.error("DynamoDB update_item failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")
    return resp.get("Attributes")


def record_login(user_id: str):
    """Update last login timestamp."""
    table = _get_table()
    try:
        table.update_item(
            Key={"userId": user_id},
            UpdateExpression="SET lastLogin = :t",
            ExpressionAttributeValues={":t": datetime.utcnow().isoformat()},
        )
    except Exception as exc:
        logger.error("DynamoDB update_item failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")


def increment_farm_count(user_id: str):
    """Increment the user's farm count after analysis."""
    table = _get_table()
    try:
        table.update_item(
            Key={"userId": user_id},
            UpdateExpression="SET farmCount = farmCount + :inc",
            ExpressionAttributeValues={":inc": 1},
        )
    except Exception as exc:
        logger.error("DynamoDB update_item failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")
