"""Farm CRUD operations backed by DynamoDB.

Table name/region come from app.config (config.DYNAMODB_FARMS_TABLE).
  Partition key: userId (String) - Cognito sub claim
  Sort key: farmId (String) - UUID generated on creation

No GSI: list_farms only ever queries by the userId partition key.
"""
import json
import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

import boto3
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from shapely.geometry import Polygon
from pyproj import Transformer

from . import config
from .auth_middleware import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/farms", tags=["farms"])

_dynamodb = None


def _get_table():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb", region_name=config.AWS_REGION)
    return _dynamodb.Table(config.DYNAMODB_FARMS_TABLE)


# ---------------------------------------------------------------------------
# Helpers for DynamoDB Decimal conversion
# ---------------------------------------------------------------------------

def _to_decimal(obj):
    """Recursively convert floats to Decimal for DynamoDB."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_decimal(i) for i in obj]
    return obj


def _from_decimal(obj):
    """Recursively convert Decimals back to float for JSON serialization."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _from_decimal(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_from_decimal(i) for i in obj]
    return obj


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class FarmCreateRequest(BaseModel):
    name: Optional[str] = None
    status: str = "pending"
    yield_value: Optional[float] = Field(None, alias="yield")
    area: Optional[float] = None
    coordinates: list  # [[lat, lng], ...]
    center: Optional[list] = None
    confidence: Optional[float] = None
    year: Optional[int] = None
    analyses: Optional[dict] = None

    model_config = {"populate_by_name": True}


class FarmUpdateRequest(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    yield_value: Optional[float] = Field(None, alias="yield")
    area: Optional[float] = None
    coordinates: Optional[list] = None
    center: Optional[list] = None
    confidence: Optional[float] = None
    year: Optional[int] = None
    analyses: Optional[dict] = None

    model_config = {"populate_by_name": True}


class FarmResponse(BaseModel):
    farmId: str
    userId: str
    name: Optional[str] = None
    status: str = "pending"
    yield_value: Optional[float] = Field(None, alias="yield")
    area: Optional[float] = None
    coordinates: Optional[list] = None
    center: Optional[list] = None
    confidence: Optional[float] = None
    year: Optional[int] = None
    analyses: Optional[dict] = None
    createdAt: str = ""
    updatedAt: str = ""

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Geometry validation helpers
# ---------------------------------------------------------------------------

def _validate_geometry(coordinates: list) -> Polygon:
    """Validate coordinates and return a Shapely Polygon.

    Coordinates are expected as [[lat, lng], ...].
    Returns the polygon or raises HTTPException(400).
    """
    try:
        if len(coordinates) < 3:
            raise ValueError("Polygon requires at least 3 points")
        # Convert [lat, lng] to [lng, lat] for Shapely (x=lng, y=lat)
        ring = [(c[1], c[0]) for c in coordinates]
        # Close the ring if not already closed
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        geom = Polygon(ring)
        if not geom.is_valid:
            raise ValueError(f"Invalid polygon: {geom.is_valid}")
        return geom
    except (IndexError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid GeoJSON geometry: {exc}")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid GeoJSON geometry: {exc}")


def _compute_center(geom: Polygon) -> list:
    """Compute centroid as [lat, lng]."""
    c = geom.centroid
    return [c.y, c.x]


def _compute_area_ha(geom: Polygon) -> float:
    """Compute area in hectares using UTM projection."""
    try:
        transformer = Transformer.from_crs("EPSG:4326", "EPSG:32630", always_xy=True)
        from shapely.ops import transform as shapely_transform
        projected = shapely_transform(lambda x, y: transformer.transform(x, y), geom)
        return round(projected.area / 10000, 2)
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# DynamoDB CRUD operations
# ---------------------------------------------------------------------------

def _item_to_response(item: dict) -> dict:
    """Convert a DynamoDB item to a FarmResponse-compatible dict."""
    item = _from_decimal(item)
    return {
        "farmId": item.get("farmId", ""),
        "userId": item.get("userId", ""),
        "name": item.get("name"),
        "status": item.get("status", "pending"),
        "yield": item.get("yield"),
        "area": item.get("area"),
        "coordinates": item.get("coordinates"),
        "center": item.get("center"),
        "confidence": item.get("confidence"),
        "year": item.get("year"),
        "analyses": item.get("analyses"),
        "createdAt": item.get("createdAt", ""),
        "updatedAt": item.get("updatedAt", ""),
    }


def create_farm(user_id: str, farm: FarmCreateRequest) -> dict:
    """Create a new farm in DynamoDB."""
    table = _get_table()
    farm_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    # Validate geometry and compute derived fields
    geom = _validate_geometry(farm.coordinates)
    center = farm.center if farm.center else _compute_center(geom)
    area = farm.area if farm.area else _compute_area_ha(geom)

    item = {
        "userId": user_id,
        "farmId": farm_id,
        "name": farm.name or f"Farm {farm_id[:8]}",
        "status": farm.status,
        "coordinates": farm.coordinates,
        "center": center,
        "area": area,
        "year": farm.year or datetime.now().year,
        "createdAt": now,
        "updatedAt": now,
    }
    if farm.yield_value is not None:
        item["yield"] = farm.yield_value
    if farm.confidence is not None:
        item["confidence"] = farm.confidence
    if farm.analyses:
        item["analyses"] = farm.analyses

    try:
        table.put_item(Item=_to_decimal(item))
    except Exception as exc:
        logger.error("DynamoDB put_item failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")

    return _item_to_response(item)


def list_farms(user_id: str) -> list[dict]:
    """List all farms for a user."""
    table = _get_table()
    try:
        resp = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("userId").eq(user_id)
        )
        return [_item_to_response(item) for item in resp.get("Items", [])]
    except Exception as exc:
        logger.error("DynamoDB query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")


def get_farm(user_id: str, farm_id: str) -> dict:
    """Get a specific farm. Raises 404 if not found or not owned by user."""
    table = _get_table()
    try:
        resp = table.get_item(Key={"userId": user_id, "farmId": farm_id})
    except Exception as exc:
        logger.error("DynamoDB get_item failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Farm not found")
    return _item_to_response(item)


def update_farm(user_id: str, farm_id: str, updates: FarmUpdateRequest) -> dict:
    """Update a farm. Only provided fields are changed."""
    # First verify the farm exists and belongs to this user
    get_farm(user_id, farm_id)

    table = _get_table()
    now = datetime.utcnow().isoformat()

    # Build update expression from non-None fields
    update_data = {}
    if updates.name is not None:
        update_data["name"] = updates.name
    if updates.status is not None:
        update_data["status"] = updates.status
    if updates.yield_value is not None:
        update_data["yield"] = updates.yield_value
    if updates.area is not None:
        update_data["area"] = updates.area
    if updates.coordinates is not None:
        geom = _validate_geometry(updates.coordinates)
        update_data["coordinates"] = updates.coordinates
        if updates.center is None:
            update_data["center"] = _compute_center(geom)
    if updates.center is not None:
        update_data["center"] = updates.center
    if updates.confidence is not None:
        update_data["confidence"] = updates.confidence
    if updates.year is not None:
        update_data["year"] = updates.year
    if updates.analyses is not None:
        update_data["analyses"] = updates.analyses

    update_data["updatedAt"] = now

    expr_parts = []
    expr_names = {}
    expr_values = {}
    for i, (key, val) in enumerate(update_data.items()):
        alias = f"#k{i}"
        placeholder = f":v{i}"
        expr_parts.append(f"{alias} = {placeholder}")
        expr_names[alias] = key
        expr_values[placeholder] = _to_decimal(val)

    try:
        resp = table.update_item(
            Key={"userId": user_id, "farmId": farm_id},
            UpdateExpression="SET " + ", ".join(expr_parts),
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ReturnValues="ALL_NEW",
        )
        return _item_to_response(resp["Attributes"])
    except Exception as exc:
        logger.error("DynamoDB update_item failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")


def delete_farm(user_id: str, farm_id: str) -> None:
    """Delete a farm. Raises 404 if not found."""
    get_farm(user_id, farm_id)  # Verify ownership
    table = _get_table()
    try:
        table.delete_item(Key={"userId": user_id, "farmId": farm_id})
    except Exception as exc:
        logger.error("DynamoDB delete_item failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")


def update_farm_analysis(user_id: str, farm_id: str, year: int, analysis: dict) -> dict:
    """Store analysis results for a specific year without overwriting other years.

    Uses a DynamoDB SET expression on the nested analyses map key.
    """
    get_farm(user_id, farm_id)  # Verify ownership
    table = _get_table()
    now = datetime.utcnow().isoformat()
    year_key = str(year)

    try:
        # First ensure the analyses map exists
        table.update_item(
            Key={"userId": user_id, "farmId": farm_id},
            UpdateExpression="SET #a = if_not_exists(#a, :empty)",
            ExpressionAttributeNames={"#a": "analyses"},
            ExpressionAttributeValues={":empty": {}},
        )
        # Then set the specific year entry
        resp = table.update_item(
            Key={"userId": user_id, "farmId": farm_id},
            UpdateExpression="SET #a.#yr = :data, #u = :now",
            ExpressionAttributeNames={"#a": "analyses", "#yr": year_key, "#u": "updatedAt"},
            ExpressionAttributeValues={
                ":data": _to_decimal(analysis),
                ":now": now,
            },
            ReturnValues="ALL_NEW",
        )
        return _item_to_response(resp["Attributes"])
    except Exception as exc:
        logger.error("DynamoDB update analysis failed: %s", exc)
        raise HTTPException(status_code=500, detail="Storage error. Please try again.")


# ---------------------------------------------------------------------------
# FastAPI route handlers
# ---------------------------------------------------------------------------

@router.post("/")
async def create_farm_endpoint(
    farm: FarmCreateRequest,
    user_id: str = Depends(get_current_user),
):
    """Create a new farm under the authenticated user."""
    return create_farm(user_id, farm)


@router.get("/")
async def list_farms_endpoint(user_id: str = Depends(get_current_user)):
    """List all farms for the authenticated user."""
    return list_farms(user_id)


@router.get("/{farm_id}")
async def get_farm_endpoint(farm_id: str, user_id: str = Depends(get_current_user)):
    """Get a specific farm. Returns 404 if not owned by user."""
    return get_farm(user_id, farm_id)


@router.put("/{farm_id}")
async def update_farm_endpoint(
    farm_id: str,
    farm: FarmUpdateRequest,
    user_id: str = Depends(get_current_user),
):
    """Update a farm. Returns 404 if not owned by user."""
    return update_farm(user_id, farm_id, farm)


@router.delete("/{farm_id}")
async def delete_farm_endpoint(farm_id: str, user_id: str = Depends(get_current_user)):
    """Delete a farm. Returns 404 if not owned by user."""
    delete_farm(user_id, farm_id)
    return {"status": "deleted", "farmId": farm_id}


class BatchDeleteRequest(BaseModel):
    farm_ids: list[str]


@router.post("/batch-delete")
async def batch_delete_farms(request: BatchDeleteRequest, user_id: str = Depends(get_current_user)):
    """Delete multiple farms in one request. Skips any that don't exist."""
    deleted = []
    failed = []
    for farm_id in request.farm_ids:
        try:
            delete_farm(user_id, farm_id)
            deleted.append(farm_id)
        except Exception:
            failed.append(farm_id)
    return {"deleted": deleted, "failed": failed, "count": len(deleted)}
