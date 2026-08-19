"""Load and run the trained ML models."""
import os
import json
import tempfile
import numpy as np
import boto3
from joblib import load as joblib_load
from . import config

# Cache loaded models in memory (Lambda warm starts reuse these)
_classifier = None
_regressor = None
_metadata = None


def _download_from_s3(key: str) -> str:
    """Download a file from S3 to a temp path."""
    s3 = boto3.client("s3", region_name=config.AWS_REGION)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(key)[1])
    s3.download_file(config.S3_BUCKET, key, tmp.name)
    return tmp.name


def _load_local_or_s3(key: str, local_path: str = None):
    """Try loading from local path first (dev), then S3 (production)."""
    if local_path and os.path.exists(local_path):
        return local_path
    return _download_from_s3(key)


def get_classifier():
    """Load the maize classifier model."""
    global _classifier
    if _classifier is None:
        # Use MODEL_VERSION_PATH so updated models can be deployed without code changes (Req 9.4)
        classifier_key = f"{config.MODEL_VERSION_PATH}/maize_classifier.joblib"
        path = _load_local_or_s3(
            classifier_key,
            os.getenv("LOCAL_CLASSIFIER_PATH", "models/maize_classifier.joblib")
        )
        _classifier = joblib_load(path)
    return _classifier


def get_regressor():
    """Load the yield regressor model."""
    global _regressor
    if _regressor is None:
        # Use MODEL_VERSION_PATH so updated models can be deployed without code changes (Req 9.4)
        regressor_key = f"{config.MODEL_VERSION_PATH}/yield_regressor.joblib"
        path = _load_local_or_s3(
            regressor_key,
            os.getenv("LOCAL_REGRESSOR_PATH", "models/yield_regressor.joblib")
        )
        _regressor = joblib_load(path)
    return _regressor


def predict(features: dict) -> dict:
    """
    Run classification and yield prediction on extracted features.
    
    Args:
        features: dict with keys matching config.FEATURE_COLUMNS
    
    Returns:
        dict with classification, yield, confidence, health_status
    """
    # Build feature vector in correct order
    X = np.array([[features.get(col, 0.0) for col in config.FEATURE_COLUMNS]])
    
    # Replace any NaN with 0 (safety net)
    X = np.nan_to_num(X, nan=0.0)
    
    classifier = get_classifier()
    regressor = get_regressor()
    
    # Classification: maize (1) or non-maize (0)
    crop_class = int(classifier.predict(X)[0])
    class_proba = classifier.predict_proba(X)[0]
    confidence = float(max(class_proba))
    
    result = {
        "classification": "maize" if crop_class == 1 else "non-maize",
        "confidence": round(confidence, 4),
        "is_maize": crop_class == 1,
    }
    
    # Yield prediction (only meaningful for maize)
    if crop_class == 1:
        yield_pred = float(regressor.predict(X)[0])
        yield_pred = max(0.0, yield_pred)  # Can't be negative
        
        # Health status based on yield relative to regional average (~1.9 mt/ha)
        if yield_pred >= 2.5:
            health = "excellent"
        elif yield_pred >= 1.5:
            health = "good"
        elif yield_pred >= 0.8:
            health = "moderate"
        else:
            health = "poor"
        
        result["yield_mt_ha"] = round(yield_pred, 3)
        result["health_status"] = health
    else:
        result["yield_mt_ha"] = None
        result["health_status"] = None
    
    # Include key vegetation indices for the frontend
    result["indices"] = {
        "ndvi": features.get("NDVI", 0),
        "evi": features.get("EVI", 0),
        "ndmi": features.get("NDMI", 0),
    }
    
    return result
