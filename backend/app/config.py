"""Configuration for the Maize Intelligence backend.

Environment-specific values (region, resource names, IDs, allowed origins,
the GEE key path) are required env vars with no hardcoded fallback — an
unset value fails fast at import time instead of silently defaulting to a
value that happened to be correct in one environment. Static, non-deployment
-specific app constants (feature columns, STAC URL, etc.) are plain
constants below and are intentionally not env-driven.
"""
import os


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Required environment variable {name} is not set. "
            "See backend/.env.example for the full list of required variables."
        )
    return value


# AWS
AWS_REGION = _require("AWS_REGION")
S3_BUCKET = _require("S3_BUCKET")

# DynamoDB
DYNAMODB_FARMS_TABLE = _require("DYNAMODB_FARMS_TABLE")
DYNAMODB_USERS_TABLE = _require("DYNAMODB_USERS_TABLE")

# Cognito (JWT verification)
COGNITO_REGION = _require("COGNITO_REGION")
COGNITO_USER_POOL_ID = _require("COGNITO_USER_POOL_ID")
COGNITO_CLIENT_ID = _require("COGNITO_CLIENT_ID")

# CORS — comma-separated list of allowed origins
ALLOWED_ORIGINS = [origin.strip() for origin in _require("ALLOWED_ORIGINS").split(",") if origin.strip()]

# Google Earth Engine service account key — absolute path to the JSON key
# file on disk. Populated at container/host runtime from Secrets Manager;
# never bundled into the image or committed to git.
GEE_SERVICE_ACCOUNT_KEY = _require("GEE_SERVICE_ACCOUNT_KEY")

# Model files on S3 (static — not environment-specific)
MODEL_PREFIX = "models/v1"
CLASSIFIER_KEY = f"{MODEL_PREFIX}/maize_classifier.joblib"
REGRESSOR_KEY = f"{MODEL_PREFIX}/yield_regressor.joblib"
METADATA_KEY = f"{MODEL_PREFIX}/model_metadata.json"

# Sentinel-2 STAC (static)
STAC_URL = "https://earth-search.aws.element84.com/v1"
S2_COLLECTION = "sentinel-2-l2a"
MAX_CLOUD_COVER = 30
DEFAULT_DAYS_BACK = 90

# Feature extraction (static)
OUTPUT_CRS = "EPSG:32630"  # UTM Zone 30N (Ghana)
RESOLUTION = 20  # meters (matches training resolution)

# 15 features in order (must match training) — static
FEATURE_COLUMNS = [
    "NDVI", "EVI", "NDMI", "GCVI", "LSWI", "NDRE", "MTCI",
    "B4_red", "B8_nir", "B11_swir1",
    "elevation", "slope", "precip", "temp_max", "SOC"
]

# Configurable model version path (supports deploying updated models without
# code changes) — has a sensible non-secret default, not environment-specific
MODEL_VERSION_PATH = os.getenv("MODEL_VERSION_PATH", MODEL_PREFIX)

# Band mapping: Earth Search asset names (static)
BAND_ASSETS = {
    "blue": "blue",
    "green": "green",
    "red": "red",
    "red_edge_1": "rededge1",
    "red_edge_2": "rededge2",
    "red_edge_3": "rededge3",
    "nir": "nir",
    "swir_1": "swir16",
    "swir_2": "swir22",
}
