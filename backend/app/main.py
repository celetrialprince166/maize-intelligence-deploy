"""Maize Intelligence API — FastAPI application."""
import json
import logging
import os
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel, Field
from typing import Optional
from shapely.geometry import shape

# Always use GEE — it's the backbone of the maize yield project
_sat_backend = "gee"
from .satellite_gee import (
    search_sentinel2,
    extract_spectral_features,
    search_sentinel2_season,
    extract_time_series,
    extract_pixel_grid,
    extract_true_color_thumbnail,
)
from .ancillary import get_ancillary_features
from .aggregation import compute_farm_comparison
from .prediction_log import log_prediction
from .models import predict
from . import users as user_service
from .farms import router as farms_router
from .auth_middleware import get_optional_user
from . import config

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Maize Intelligence API",
    description="Maize classification and yield prediction for Ghana",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register farm CRUD routes
app.include_router(farms_router)


class AnalyzeRequest(BaseModel):
    """Request body for farm analysis."""
    geometry: dict  # GeoJSON geometry (Polygon or MultiPolygon)
    name: Optional[str] = None
    days_back: Optional[int] = 90
    season_year: Optional[int] = Field(default_factory=lambda: datetime.now().year)
    farm_id: Optional[str] = None  # If provided + auth, store results in farm record


class AnalyzeResponse(BaseModel):
    """Response from farm analysis."""
    classification: str
    confidence: float
    is_maize: bool
    yield_mt_ha: Optional[float]
    health_status: Optional[str]
    indices: dict
    satellite_date: Optional[str]
    area_ha: Optional[float]


class TimeSeriesEntry(BaseModel):
    """A single time-series observation from one Sentinel-2 scene."""
    date: str
    ndvi: float
    evi: float
    ndmi: float
    gcvi: float
    ndre: float


class PixelGrid(BaseModel):
    """Per-pixel NDVI data for spatial health gradient visualization."""
    ndvi_grid: list[list[float]]
    bbox: list[float]  # [minx, miny, maxx, maxy]
    resolution_m: float
    rows: int
    cols: int


class AncillaryData(BaseModel):
    """Ancillary environmental data with source tracking."""
    elevation: float
    slope: float
    precip: float
    temp_max: float
    SOC: float
    sources: dict[str, str]
    warnings: list[str]


class FarmComparison(BaseModel):
    """Farm performance relative to district averages."""
    district_avg_yield: float
    district_avg_ndvi: float
    yield_percentile: float
    ndvi_delta: float


class ModelQuality(BaseModel):
    """ML model quality metadata for transparency."""
    r2: float
    rmse: float
    sample_count: int


class EnrichedAnalyzeResponse(BaseModel):
    """Full enriched response from farm analysis."""
    # Existing fields
    classification: str
    confidence: float
    is_maize: bool
    yield_mt_ha: Optional[float]
    health_status: Optional[str]
    indices: dict
    satellite_date: Optional[str]
    area_ha: Optional[float]
    # New fields
    time_series: list[TimeSeriesEntry]
    time_series_warning: Optional[str] = None
    pixel_grid: Optional[PixelGrid] = None
    pixel_grid_warning: Optional[str] = None
    ancillary: AncillaryData
    comparison: FarmComparison
    model_quality: ModelQuality
    true_color_thumbnail: Optional[str] = None


class DistrictSummary(BaseModel):
    """Aggregated metrics for a district."""
    district_id: str
    district_name: str
    avg_yield: float
    avg_ndvi: float
    farm_count: int
    total_area_ha: float


def _load_model_quality() -> ModelQuality:
    """Load model quality metrics from model_metadata.json.

    Tries the local dev path first (MaizeYield/backend/models/), then falls
    back to a path relative to this package.  Returns zeros on failure so the
    endpoint never breaks due to a missing metadata file.
    """
    candidate_paths = [
        # Local dev: relative to this file (app/ → backend/ → models/)
        os.path.join(os.path.dirname(__file__), "..", "models", "model_metadata.json"),
        # Alternate: repo root level
        os.path.join(os.path.dirname(__file__), "..", "..", "models", "model_metadata.json"),
    ]
    for path in candidate_paths:
        try:
            with open(os.path.normpath(path), encoding="utf-8") as fh:
                meta = json.load(fh)
            return ModelQuality(
                r2=float(meta.get("regressor_cv_r2", 0.0)),
                rmse=float(meta.get("regressor_cv_rmse", 0.0)),
                sample_count=int(meta.get("samples_regressor", 0)),
            )
        except Exception:
            continue
    logger.warning("model_metadata.json not found; returning zero model quality")
    return ModelQuality(r2=0.0, rmse=0.0, sample_count=0)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "maize-intelligence"}


class MapTileRequest(BaseModel):
    geometry: dict
    year: int = 2023


@app.post("/map/classification")
def get_classification_tiles(request: MapTileRequest):
    """Get GEE map tile URL for classification layer (maize/non-maize)."""
    from .satellite_gee import get_classification_map_url
    result = get_classification_map_url(request.geometry, request.year)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to generate classification map")
    return result


@app.post("/map/yield")
def get_yield_tiles(request: MapTileRequest):
    """Get GEE map tile URL for yield prediction layer."""
    from .satellite_gee import get_yield_map_url
    result = get_yield_map_url(request.geometry, request.year)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to generate yield map")
    return result


@app.post("/analyze", response_model=EnrichedAnalyzeResponse)
async def analyze_farm(
    request: AnalyzeRequest,
    user_id: Optional[str] = Depends(get_optional_user),
):
    """
    Analyze a farm polygon for maize classification and yield prediction.
    Runs GEE analysis synchronously. For deployed Lambda behind API Gateway,
    use /analyze/async + /analyze/status/{job_id} to avoid the 29s timeout.
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    loop = asyncio.get_event_loop()
    executor = ThreadPoolExecutor(max_workers=2)

    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(executor, _analyze_farm_sync, request),
            timeout=300,
        )

        # Store analysis in farm record if farm_id provided and user authenticated
        if request.farm_id and user_id:
            try:
                from .farms import update_farm_analysis
                season_year = request.season_year or datetime.now().year
                analysis_data = {
                    "year": season_year,
                    "status": "maize" if result.is_maize else "non-maize",
                    "yield": result.yield_mt_ha,
                    "confidence": result.confidence,
                    "area": result.area_ha,
                    "time_series": [ts.model_dump() for ts in result.time_series] if result.time_series else [],
                    "ancillary": result.ancillary.model_dump() if result.ancillary else {},
                    "comparison": result.comparison.model_dump() if result.comparison else {},
                }
                if result.pixel_grid:
                    analysis_data["pixel_grid"] = result.pixel_grid.model_dump()
                update_farm_analysis(user_id, request.farm_id, season_year, analysis_data)
            except Exception as exc:
                logger.warning("Failed to store analysis in farm record: %s", exc)

        return result
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Analysis timed out. The farm polygon may be too large or satellite data unavailable.")
    except Exception as e:
        logger.error("Analysis error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Async analysis (for deployed Lambda behind API Gateway with 29s timeout)
# ---------------------------------------------------------------------------
import threading
import uuid as _uuid

_analysis_jobs: dict[str, dict] = {}  # job_id -> {status, result, error}


@app.post("/analyze/async")
async def analyze_farm_async(
    request: AnalyzeRequest,
    user_id: Optional[str] = Depends(get_optional_user),
):
    """Start an async analysis job. Returns a job_id to poll with /analyze/status/{job_id}."""
    job_id = str(_uuid.uuid4())
    _analysis_jobs[job_id] = {"status": "running", "result": None, "error": None}

    def run_job():
        try:
            result = _analyze_farm_sync(request)
            # Store in farm record if applicable
            if request.farm_id and user_id:
                try:
                    from .farms import update_farm_analysis
                    season_year = request.season_year or datetime.now().year
                    analysis_data = {
                        "year": season_year,
                        "status": "maize" if result.is_maize else "non-maize",
                        "yield": result.yield_mt_ha,
                        "confidence": result.confidence,
                        "area": result.area_ha,
                    }
                    update_farm_analysis(user_id, request.farm_id, season_year, analysis_data)
                except Exception:
                    pass
            _analysis_jobs[job_id] = {"status": "complete", "result": result.model_dump(), "error": None}
        except Exception as e:
            _analysis_jobs[job_id] = {"status": "failed", "result": None, "error": str(e)}

    thread = threading.Thread(target=run_job, daemon=True)
    thread.start()

    return {"job_id": job_id, "status": "running"}


@app.get("/analyze/status/{job_id}")
async def get_analysis_status(job_id: str):
    """Poll for async analysis results."""
    job = _analysis_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _analyze_farm_sync(request: AnalyzeRequest):
    """Synchronous analysis logic — runs in thread pool."""
    from pyproj import Transformer

    geometry = request.geometry
    season_year = request.season_year or datetime.now().year

    # Validate geometry
    try:
        geom = shape(geometry)
        if not geom.is_valid:
            raise ValueError("Invalid geometry")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid GeoJSON geometry: {e}")

    # Calculate area in hectares
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:32630", always_xy=True)
    projected = transform_geometry(geom, transformer)
    area_ha = projected.area / 10000  # m² to hectares

    # 1. Search ALL scenes for the growing season
    season_items = search_sentinel2_season(geometry, season_year)

    # Also fall back to the legacy search if no season scenes found
    if not season_items:
        season_items = search_sentinel2(geometry, days_back=request.days_back)

    if not season_items:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No cloud-free Sentinel-2 imagery found for the {season_year} "
                "growing season. Try a different year or increase days_back."
            ),
        )

    # 2. Select the best item for classification
    # GEE backend returns dicts with _date key; STAC returns pystac Items
    best_item = season_items[0]
    if hasattr(best_item, "properties"):
        # Legacy STAC item
        best_item = min(
            season_items,
            key=lambda it: it.properties.get("eo:cloud_cover", 100),
        )
        satellite_date = best_item.properties.get("datetime", "")[:10]
    else:
        # GEE dict wrapper
        satellite_date = best_item.get("_date", "")

    # 3. Time-series extraction via GEE
    time_series: list[TimeSeriesEntry] = []
    time_series_warning: Optional[str] = None
    try:
        ts_raw = extract_time_series(season_items, geometry)
        if ts_raw:
            time_series = [
                TimeSeriesEntry(
                    date=t["date"], ndvi=t.get("ndvi", 0), evi=t.get("evi", 0),
                    ndmi=t.get("ndmi", 0), gcvi=t.get("gcvi", 0), ndre=t.get("ndre", 0),
                )
                for t in ts_raw
            ]
        else:
            time_series_warning = "No time-series data available."
    except Exception as e:
        logger.warning("Time-series extraction failed: %s", e)
        time_series_warning = str(e)

    # 4. Per-pixel NDVI grid
    pixel_grid: Optional[PixelGrid] = None
    pixel_grid_warning: Optional[str] = None

    # 5. Spectral features from best scene (the core analysis)
    spectral = extract_spectral_features(best_item, geometry)
    if spectral is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to extract spectral features from satellite imagery",
        )

    # 6. Ancillary features with source tracking
    centroid = geom.centroid
    ancillary_raw = get_ancillary_features(centroid.x, centroid.y, year=season_year)

    # Extract numeric values for the ML model (exclude metadata keys)
    _meta_keys = {"sources", "warnings"}
    ancillary_numeric = {k: v for k, v in ancillary_raw.items() if k not in _meta_keys}
    ancillary_data = AncillaryData(**ancillary_raw)

    # 7. Combine features and run GEE per-pixel classification
    features = {**spectral, **ancillary_numeric}

    try:
        from .satellite_gee import classify_farm_gee
        gee_result = classify_farm_gee(geometry, season_year)
        if gee_result:
            is_maize = gee_result["is_maize"]
            confidence = gee_result["confidence"]
            yield_mt_ha = (gee_result["yield_kg_ha"] / 1000.0) if gee_result.get("yield_kg_ha") else None
            if yield_mt_ha is not None:
                yield_mt_ha = max(0.0, yield_mt_ha)
                health = "excellent" if yield_mt_ha >= 2.5 else "good" if yield_mt_ha >= 1.5 else "moderate" if yield_mt_ha >= 0.8 else "poor"
            else:
                health = None
            result = {
                "classification": gee_result["classification"],
                "confidence": confidence,
                "is_maize": is_maize,
                "yield_mt_ha": round(yield_mt_ha, 3) if yield_mt_ha else None,
                "health_status": health,
                "indices": {"ndvi": spectral.get("NDVI", 0), "evi": spectral.get("EVI", 0), "ndmi": spectral.get("NDMI", 0)},
            }
            result["satellite_date"] = satellite_date
            result["area_ha"] = round(area_ha, 2)
        else:
            # Fallback to local model if GEE classification returns None
            result = predict(features)
            result["satellite_date"] = satellite_date
            result["area_ha"] = round(area_ha, 2)
    except Exception as e:
        logger.warning("GEE classification failed, using local model: %s", e)
        result = predict(features)
        result["satellite_date"] = satellite_date
        result["area_ha"] = round(area_ha, 2)

    # 8. District comparison (empty district list — populated as farms accumulate)
    farm_dict = {
        "yield": result.get("yield_mt_ha") or 0.0,
        "ndvi": spectral.get("NDVI", 0.0),
    }
    comparison_raw = compute_farm_comparison(farm_dict, [])
    comparison = FarmComparison(**comparison_raw)

    # 9. True-color satellite thumbnail
    true_color_thumbnail: Optional[str] = None
    try:
        true_color_thumbnail = extract_true_color_thumbnail(best_item, geometry)
    except Exception as e:
        logger.warning("Thumbnail failed: %s", e)

    # 10. Model quality from metadata file
    model_quality = _load_model_quality()

    # 11. Log prediction (non-blocking)
    log_prediction(
        farm_name=request.name or "unknown",
        features=features,
        result={
            "classification": result["classification"],
            "confidence": result["confidence"],
            "yield_mt_ha": result.get("yield_mt_ha"),
            "health_status": result.get("health_status"),
        },
        year=season_year,
    )

    return EnrichedAnalyzeResponse(
        classification=result["classification"],
        confidence=result["confidence"],
        is_maize=result["is_maize"],
        yield_mt_ha=result.get("yield_mt_ha"),
        health_status=result.get("health_status"),
        indices=result["indices"],
        satellite_date=result["satellite_date"],
        area_ha=result["area_ha"],
        time_series=time_series,
        time_series_warning=time_series_warning,
        pixel_grid=pixel_grid,
        pixel_grid_warning=pixel_grid_warning,
        ancillary=ancillary_data,
        comparison=comparison,
        model_quality=model_quality,
        true_color_thumbnail=true_color_thumbnail,
    )


@app.post("/analyze/batch")
def analyze_batch(polygons: list[AnalyzeRequest]):
    """Analyze multiple farm polygons (for file uploads)."""
    results = []
    errors = []

    for i, req in enumerate(polygons):
        try:
            result = _analyze_farm_sync(req)
            results.append({"index": i, "name": req.name, **result.model_dump()})
        except HTTPException as e:
            errors.append({"index": i, "name": req.name, "error": e.detail})
        except Exception as e:
            errors.append({"index": i, "name": req.name, "error": str(e)})

    return {"results": results, "errors": errors, "total": len(polygons), "success": len(results)}


# ---------------------------------------------------------------------------
# Northern Ghana districts — hardcoded for now; populated as farms accumulate
# ---------------------------------------------------------------------------
_NORTHERN_GHANA_DISTRICTS = [
    {
        "district_id": "tamale_metro",
        "district_name": "Tamale Metropolitan",
        "avg_yield": 0.0,
        "avg_ndvi": 0.0,
        "farm_count": 0,
        "total_area_ha": 0.0,
    },
    {
        "district_id": "nanton",
        "district_name": "Nanton",
        "avg_yield": 0.0,
        "avg_ndvi": 0.0,
        "farm_count": 0,
        "total_area_ha": 0.0,
    },
    {
        "district_id": "gushegu",
        "district_name": "Gushegu",
        "avg_yield": 0.0,
        "avg_ndvi": 0.0,
        "farm_count": 0,
        "total_area_ha": 0.0,
    },
]


@app.get("/districts/summary", response_model=list[DistrictSummary])
def get_districts_summary():
    """Return aggregated metrics per district.

    Currently returns placeholder data for the three Northern Ghana districts
    (Tamale Metropolitan, Nanton, Gushegu).  As farms are analyzed via
    /analyze, real aggregation will be computed from the prediction log.
    """
    return [DistrictSummary(**d) for d in _NORTHERN_GHANA_DISTRICTS]


# Shared district seed data for the frontend
_SEED_DISTRICTS = [
    {
        "id": "dist-01",
        "name": "Tamale Metropolitan",
        "coordinates": [[9.35, -0.90], [9.35, -0.75], [9.50, -0.75], [9.50, -0.90]],
    },
    {
        "id": "dist-02",
        "name": "Nanton",
        "coordinates": [[9.50, -0.85], [9.50, -0.70], [9.65, -0.70], [9.65, -0.85]],
    },
    {
        "id": "dist-03",
        "name": "Gushegu",
        "coordinates": [[9.70, -0.55], [9.70, -0.35], [9.90, -0.35], [9.90, -0.55]],
    },
]


@app.get("/districts")
def get_districts():
    """Return shared district boundary data. Same for all authenticated users."""
    return _SEED_DISTRICTS


# Cache for GEE boundaries (expensive to fetch)
_boundaries_cache: dict[str, list] = {}


@app.get("/boundaries/regions")
def get_region_boundaries():
    """Fetch Ghana regional (ADM1) boundaries from GEE."""
    if "regions" in _boundaries_cache:
        return _boundaries_cache["regions"]
    from .satellite_gee import get_ghana_boundaries
    result = get_ghana_boundaries(admin_level=1)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to fetch region boundaries")
    _boundaries_cache["regions"] = result
    return result


@app.get("/boundaries/districts")
def get_district_boundaries():
    """Fetch Northern Ghana district (ADM2) boundaries from GEE."""
    if "districts" in _boundaries_cache:
        return _boundaries_cache["districts"]
    from .satellite_gee import get_ghana_boundaries
    result = get_ghana_boundaries(admin_level=2)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to fetch district boundaries")
    _boundaries_cache["districts"] = result
    return result


def transform_geometry(geom, transformer):
    """Transform a shapely geometry using a pyproj transformer."""
    from shapely.ops import transform as shapely_transform
    return shapely_transform(lambda x, y: transformer.transform(x, y), geom)


# ---------------------------------------------------------------------------
# User profile endpoints
# ---------------------------------------------------------------------------

class CreateUserRequest(BaseModel):
    cognito_user_id: str
    email: str
    name: str
    organization: Optional[str] = None
    role: str = "analyst"


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    organization: Optional[str] = None
    role: Optional[str] = None
    preferences: Optional[dict] = None


@app.post("/users/profile")
def create_user(request: CreateUserRequest):
    """Create a user profile after Cognito signup."""
    existing = user_service.get_user_profile(request.cognito_user_id)
    if existing:
        return existing  # Already exists, return it
    return user_service.create_user_profile(
        cognito_user_id=request.cognito_user_id,
        email=request.email,
        name=request.name,
        organization=request.organization,
        role=request.role,
    )


@app.get("/users/profile/{user_id}")
def get_user(user_id: str):
    """Get a user profile by Cognito user ID."""
    profile = user_service.get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return profile


@app.put("/users/profile/{user_id}")
def update_user(user_id: str, request: UpdateUserRequest):
    """Update a user profile."""
    updates = request.model_dump(exclude_none=True)
    profile = user_service.update_user_profile(user_id, updates)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return profile


@app.post("/users/login/{user_id}")
def record_user_login(user_id: str):
    """Record a login event for a user."""
    user_service.record_login(user_id)
    return {"status": "ok"}


# Lambda handler (for AWS deployment via API Gateway)
handler = Mangum(app)
