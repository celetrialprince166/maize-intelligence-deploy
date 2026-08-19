"""Fetch ancillary data: elevation, slope, rainfall, temperature, SOC.

Real data fetchers call free, no-auth APIs with a 10-second timeout.
On failure, each parameter falls back to the Northern Ghana regional
default and a warning is recorded.
"""
import logging
import math
from datetime import datetime

import numpy as np
import requests

logger = logging.getLogger(__name__)

# Northern Ghana regional averages (from training data statistics)
DEFAULTS = {
    "elevation": 180.0,   # meters (typical for Tamale area)
    "slope": 1.5,         # percent (relatively flat savanna)
    "precip": 800.0,      # mm (June-October total)
    "temp_max": 35.0,     # °C (average max temperature)
    "SOC": 7.5,           # g/kg (soil organic carbon)
}

_TIMEOUT = 10  # seconds for all HTTP requests


# ---------------------------------------------------------------------------
# Individual fetchers
# ---------------------------------------------------------------------------

def fetch_elevation(lon: float, lat: float) -> tuple[float, float]:
    """Fetch elevation from Open-Meteo Elevation API and estimate slope.

    Open-Meteo provides a free, no-auth elevation endpoint that is far more
    reliable than Open-Elevation (which rate-limits aggressively).

    Queries the target point plus four nearby points (~100 m offset) to
    estimate slope from the elevation gradient.

    Returns (elevation_m, slope_pct).
    """
    offset = 0.001  # ~111 m at the equator
    lats = [lat, lat + offset, lat - offset, lat, lat]
    lons = [lon, lon, lon, lon + offset, lon - offset]

    lat_str = ",".join(str(l) for l in lats)
    lon_str = ",".join(str(l) for l in lons)

    url = f"https://api.open-meteo.com/v1/elevation?latitude={lat_str}&longitude={lon_str}"
    resp = requests.get(url, timeout=_TIMEOUT)
    resp.raise_for_status()
    elevations = resp.json()["elevation"]

    elevation_m = float(elevations[0])

    elev_n = float(elevations[1])
    elev_s = float(elevations[2])
    elev_e = float(elevations[3])
    elev_w = float(elevations[4])

    dist_m = offset * 111_320
    dz_dy = (elev_n - elev_s) / (2 * dist_m)
    dz_dx = (elev_e - elev_w) / (2 * dist_m)
    slope_rad = math.atan(math.sqrt(dz_dx**2 + dz_dy**2))
    slope_pct = math.tan(slope_rad) * 100.0

    return elevation_m, slope_pct


def fetch_precipitation(lon: float, lat: float, year: int) -> float:
    """Fetch cumulative June–October precipitation from Open-Meteo historical
    weather API (same source as temperature).  Returns total mm for the
    five-month growing season window.

    This replaces the CHIRPS/IRI Data Library source which has become unreliable
    (frequent 404 errors).  Open-Meteo provides daily precipitation_sum which
    we aggregate over the Jun-Oct window.
    """
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}"
        f"&start_date={year}-06-01&end_date={year}-10-31"
        "&daily=precipitation_sum"
    )
    resp = requests.get(url, timeout=_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    precip_values = data["daily"]["precipitation_sum"]
    valid = [p for p in precip_values if p is not None and math.isfinite(p)]
    if not valid:
        raise ValueError("Open-Meteo returned no valid precipitation values")
    return float(sum(valid))


def fetch_temperature(lon: float, lat: float, year: int) -> float:
    """Fetch average daily max temperature (June–October) from Open-Meteo
    historical weather API.  Returns °C.
    """
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}"
        f"&start_date={year}-06-01&end_date={year}-10-31"
        "&daily=temperature_2m_max"
    )
    resp = requests.get(url, timeout=_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    temps = data["daily"]["temperature_2m_max"]
    valid = [t for t in temps if t is not None and math.isfinite(t)]
    if not valid:
        raise ValueError("Open-Meteo returned no valid temperature values")
    return float(np.mean(valid))


def fetch_soc(lon: float, lat: float) -> float:
    """Fetch soil organic carbon from iSDAsoil (Africa-specific, 30m resolution).

    Uses the iSDAsoil dataset on AWS Open Data (S3 bucket: isdasoil).
    The carbon_organic.tif is a continent-wide GeoTIFF — we do a windowed
    read to extract just the pixel at the given coordinates.

    Returns g/kg. iSDAsoil stores SOC in g/kg * 10 (to avoid decimals),
    so we divide by 10.

    Falls back to ISRIC SoilGrids REST API, then to climate-based estimate.
    """
    import rasterio
    from rasterio.transform import rowcol

    # Primary: iSDAsoil on AWS S3 (Africa-specific, 30m, very reliable)
    try:
        soc_url = "https://isdasoil.s3.us-west-2.amazonaws.com/soil_data/carbon_organic/carbon_organic.tif"
        with rasterio.open(soc_url) as ds:
            # Convert lon/lat to pixel coordinates
            row, col = rowcol(ds.transform, lon, lat)
            # Read a 1x1 window
            window = rasterio.windows.Window(col, row, 1, 1)
            data = ds.read(1, window=window)
            value = float(data[0, 0])
            if value > 0 and value < 10000:  # valid range
                return value / 10.0  # iSDAsoil stores as g/kg * 10
    except Exception as exc:
        logger.debug("iSDAsoil S3 read failed: %s", exc)

    # Fallback: ISRIC SoilGrids REST API (single attempt)
    try:
        url = (
            "https://rest.isric.org/soilgrids/v2.0/properties/query"
            f"?lon={lon}&lat={lat}"
            "&property=soc&depth=0-5cm&value=mean"
        )
        resp = requests.get(url, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        layers = data["properties"]["layers"]
        soc_layer = next(l for l in layers if l["name"] == "soc")
        value_cg = soc_layer["depths"][0]["values"]["mean"]
        if value_cg is not None:
            return float(value_cg) / 10.0
    except Exception as exc:
        logger.debug("ISRIC SoilGrids failed: %s", exc)

    raise ValueError("All SOC sources failed")


# ---------------------------------------------------------------------------
# Main entry point with fallback chain and source tracking
# ---------------------------------------------------------------------------

def get_ancillary_features(lon: float, lat: float, year: int = None) -> dict:
    """Fetch real ancillary data with graceful fallback to regional defaults.

    Parameters
    ----------
    lon, lat : float
        Centroid coordinates of the farm polygon.
    year : int, optional
        Growing-season year for temporal sources (precipitation, temperature).
        Defaults to the current year when not provided.

    Returns
    -------
    dict with keys:
        elevation, slope, precip, temp_max, SOC  – float values
        sources  – dict mapping each param to its data source name or
                   "regional_default"
        warnings – list of strings for each param that used fallback
    """
    if year is None:
        year = datetime.now().year

    result = {}
    sources = {}
    warnings = []

    # --- Elevation & Slope ---
    try:
        elev, slope = fetch_elevation(lon, lat)
        result["elevation"] = elev
        result["slope"] = slope
        sources["elevation"] = "open_meteo"
        sources["slope"] = "open_meteo"
    except Exception as exc:
        logger.warning("fetch_elevation failed: %s", exc)
        result["elevation"] = DEFAULTS["elevation"]
        result["slope"] = DEFAULTS["slope"]
        sources["elevation"] = "regional_default"
        sources["slope"] = "regional_default"
        warnings.append("elevation: fallback to regional default")
        warnings.append("slope: fallback to regional default")

    # --- Precipitation ---
    try:
        result["precip"] = fetch_precipitation(lon, lat, year)
        sources["precip"] = "open_meteo"
    except Exception as exc:
        logger.warning("fetch_precipitation failed: %s", exc)
        result["precip"] = DEFAULTS["precip"]
        sources["precip"] = "regional_default"
        warnings.append("precip: fallback to regional default")

    # --- Temperature ---
    try:
        result["temp_max"] = fetch_temperature(lon, lat, year)
        sources["temp_max"] = "open_meteo"
    except Exception as exc:
        logger.warning("fetch_temperature failed: %s", exc)
        result["temp_max"] = DEFAULTS["temp_max"]
        sources["temp_max"] = "regional_default"
        warnings.append("temp_max: fallback to regional default")

    # --- Soil Organic Carbon ---
    try:
        result["SOC"] = fetch_soc(lon, lat)
        sources["SOC"] = "isdasoil_aws"
    except Exception as exc:
        logger.warning("fetch_soc failed: %s", exc)
        result["SOC"] = DEFAULTS["SOC"]
        sources["SOC"] = "regional_default"
        warnings.append("SOC: fallback to regional default")

    result["sources"] = sources
    result["warnings"] = warnings
    return result
