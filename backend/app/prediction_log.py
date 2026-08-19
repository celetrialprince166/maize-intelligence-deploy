"""Structured prediction logging for future model retraining."""
import json
import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Log file lives in the backend directory (one level above this package)
_LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "prediction_log.jsonl")


def log_prediction(
    farm_name: str,
    features: dict,
    result: dict,
    year: int,
) -> None:
    """Append a structured JSON line to the prediction log.

    Each line written:
        {"timestamp": ISO8601, "farm_name": str, "year": int,
         "features": dict, "result": dict}

    Write failures are caught and logged to stderr; the function never
    raises an exception so that logging never blocks a prediction request.
    """
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "farm_name": farm_name,
        "year": year,
        "features": features,
        "result": result,
    }
    try:
        with open(_LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to write prediction log: %s", exc)
