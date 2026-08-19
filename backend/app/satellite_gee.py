"""Fetch and process Sentinel-2 imagery via Google Earth Engine.

Drop-in replacement for satellite.py — same function signatures,
but uses the GEE Python API instead of STAC + rasterio.

Requires:
  - earthengine-api
  - Service account JSON key (path in GEE_SERVICE_ACCOUNT_KEY env var)
"""
import base64
import logging
import os
from datetime import datetime, timedelta
from io import BytesIO
from typing import Optional

import ee
import numpy as np

from . import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# GEE Initialization (once per process / Lambda cold start)
# ---------------------------------------------------------------------------
_initialized = False


def _init_gee():
    """Authenticate and initialize the Earth Engine API using a service account."""
    global _initialized
    if _initialized:
        return

    key_path = os.path.abspath(config.GEE_SERVICE_ACCOUNT_KEY)

    if not os.path.exists(key_path):
        raise RuntimeError(f"GEE service account key not found at {key_path}")

    # Read service account email from the key file
    import json
    with open(key_path) as f:
        key_data = json.load(f)
    sa_email = key_data.get("client_email", "")

    credentials = ee.ServiceAccountCredentials(
        email=sa_email,
        key_file=key_path,
    )
    ee.Initialize(credentials=credentials, project=key_data.get("project_id", "ghana-project-73326"))
    _initialized = True
    logger.info("Google Earth Engine initialized (project: ghana-project-73326)")



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _geojson_to_ee_geometry(geometry_geojson: dict) -> ee.Geometry:
    """Convert a GeoJSON geometry dict to an ee.Geometry."""
    return ee.Geometry(geometry_geojson)


def _preprocess_s2(img: ee.Image) -> ee.Image:
    """Cloud-mask and compute spectral indices for a single S2 scene.

    Mirrors the GEE JavaScript preprocessS2 function:
    - SCL mask (vegetation=4, bare soil=5)
    - Scale to reflectance (*0.0001)
    - Compute NDVI, EVI, NDMI, GCVI, LSWI, NDRE, MTCI
    """
    scl = img.select("SCL")
    mask = scl.eq(4).Or(scl.eq(5))

    bands = img.select(["B2", "B3", "B4", "B5", "B6", "B8", "B11", "B12"]).multiply(0.0001)
    blue = bands.select("B2")
    green = bands.select("B3")
    red = bands.select("B4")
    nir = bands.select("B8")
    re1 = bands.select("B5")
    re2 = bands.select("B6")
    swir1 = bands.select("B11")

    ndvi = nir.subtract(red).divide(nir.add(red)).rename("NDVI")
    evi = nir.subtract(red).divide(nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1)).multiply(2.5).rename("EVI")
    ndmi = nir.subtract(swir1).divide(nir.add(swir1)).rename("NDMI")
    gcvi = nir.divide(green).subtract(1).rename("GCVI")
    lswi = nir.subtract(swir1).divide(nir.add(swir1)).rename("LSWI")
    ndre = nir.subtract(re1).divide(nir.add(re1)).rename("NDRE")
    mtci = re2.subtract(re1).divide(re1.subtract(red)).rename("MTCI")

    return (
        bands.addBands([ndvi, evi, ndmi, gcvi, lswi, ndre, mtci])
        .updateMask(mask)
        .copyProperties(img, ["system:time_start"])
    )


def _get_season_composite(geometry: ee.Geometry, year: int) -> ee.Image:
    """Build a quality mosaic for the growing season (Jun 1 – Oct 31).

    Returns a single ee.Image with spectral bands + indices, clipped to geometry.
    """
    start = ee.Date.fromYMD(year, 6, 1)
    end = ee.Date.fromYMD(year, 10, 31)

    composite = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(geometry)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", config.MAX_CLOUD_COVER))
        .map(_preprocess_s2)
        .qualityMosaic("NDVI")
    )
    return composite.clip(geometry)


def _get_recent_composite(geometry: ee.Geometry, days_back: int) -> ee.Image:
    """Fallback: build a composite from the last N days."""
    end = ee.Date(datetime.utcnow().isoformat()[:10])
    start = end.advance(-days_back, "day")

    composite = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(geometry)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", config.MAX_CLOUD_COVER))
        .map(_preprocess_s2)
        .qualityMosaic("NDVI")
    )
    return composite.clip(geometry)


# ---------------------------------------------------------------------------
# Public API — same signatures as satellite.py
# ---------------------------------------------------------------------------

def search_sentinel2(geometry_geojson: dict, days_back: int = None) -> list:
    """Search for recent Sentinel-2 scenes covering the geometry.

    Returns a list with a single composite image dict (GEE doesn't return
    individual STAC items, so we wrap the composite to match the interface).
    """
    _init_gee()
    days_back = days_back or config.DEFAULT_DAYS_BACK
    geom = _geojson_to_ee_geometry(geometry_geojson)

    end = ee.Date(datetime.utcnow().isoformat()[:10])
    start = end.advance(-days_back, "day")

    col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(geom)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", config.MAX_CLOUD_COVER))
    )
    count = col.size().getInfo()
    if count == 0:
        return []

    # Return a wrapper that mimics the STAC item interface
    composite = col.map(_preprocess_s2).qualityMosaic("NDVI").clip(geom)
    best = col.sort("CLOUDY_PIXEL_PERCENTAGE").first()
    date_str = datetime.utcfromtimestamp(
        best.get("system:time_start").getInfo() / 1000
    ).strftime("%Y-%m-%d")

    return [{"_gee_image": composite, "_date": date_str, "_count": count}]


def search_sentinel2_season(geometry_geojson: dict, year: int) -> list:
    """Search for Sentinel-2 scenes in the growing season (Jun–Oct).

    Returns a list of per-scene dicts with date and GEE image reference.
    """
    _init_gee()
    geom = _geojson_to_ee_geometry(geometry_geojson)

    start = ee.Date.fromYMD(year, 6, 1)
    end = ee.Date.fromYMD(year, 10, 31)

    col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(geom)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", config.MAX_CLOUD_COVER))
    )
    count = col.size().getInfo()
    if count == 0:
        return []

    # Build the quality mosaic (best-pixel composite) for classification
    composite = col.map(_preprocess_s2).qualityMosaic("NDVI").clip(geom)
    best = col.sort("CLOUDY_PIXEL_PERCENTAGE").first()
    date_str = datetime.utcfromtimestamp(
        best.get("system:time_start").getInfo() / 1000
    ).strftime("%Y-%m-%d")

    # Also collect individual scene dates for time-series
    scene_list = col.aggregate_array("system:time_start").getInfo()
    scenes = []
    for ts in scene_list:
        scenes.append({
            "_date": datetime.utcfromtimestamp(ts / 1000).strftime("%Y-%m-%d"),
        })

    # First item is the composite (used for classification)
    return [{
        "_gee_image": composite,
        "_gee_collection": col,
        "_date": date_str,
        "_count": count,
        "_scenes": scenes,
    }]


def extract_spectral_features(item: dict, geometry_geojson: dict) -> Optional[dict]:
    """Extract median spectral features from a GEE composite image.

    Returns a dict matching the keys expected by models.py:
        NDVI, EVI, NDMI, GCVI, LSWI, NDRE, MTCI, B4_red, B8_nir, B11_swir1
    """
    _init_gee()
    geom = _geojson_to_ee_geometry(geometry_geojson)
    composite = item["_gee_image"]

    bands_to_reduce = [
        "NDVI", "EVI", "NDMI", "GCVI", "LSWI", "NDRE", "MTCI",
        "B4", "B8", "B11",
    ]

    try:
        stats = composite.select(bands_to_reduce).reduceRegion(
            reducer=ee.Reducer.median(),
            geometry=geom,
            scale=10,
            maxPixels=1e7,
            bestEffort=True,
        ).getInfo()
    except Exception as e:
        logger.error("GEE reduceRegion failed: %s", e)
        return None

    if not stats or stats.get("NDVI") is None:
        logger.warning("No valid pixels in region")
        return None

    return {
        "NDVI": float(stats.get("NDVI", 0) or 0),
        "EVI": float(stats.get("EVI", 0) or 0),
        "NDMI": float(stats.get("NDMI", 0) or 0),
        "GCVI": float(stats.get("GCVI", 0) or 0),
        "LSWI": float(stats.get("LSWI", 0) or 0),
        "NDRE": float(stats.get("NDRE", 0) or 0),
        "MTCI": float(np.clip(stats.get("MTCI", 0) or 0, -10, 10)),
        "B4_red": float(stats.get("B4", 0) or 0),
        "B8_nir": float(stats.get("B8", 0) or 0),
        "B11_swir1": float(stats.get("B11", 0) or 0),
    }


def extract_time_series(items: list, geometry_geojson: dict) -> list:
    """Extract per-scene median indices for the growing season.

    Uses the GEE collection stored in the first item to compute
    time-series without downloading raw pixels.
    
    Uses a relaxed cloud mask (SCL classes 4,5,6,7) to maximize
    valid observations during the rainy season.
    """
    _init_gee()
    geom = _geojson_to_ee_geometry(geometry_geojson)

    if not items or "_gee_collection" not in items[0]:
        return []

    # Use a broader collection with higher cloud tolerance for time-series
    # This gives more temporal coverage during the rainy season
    col_base = items[0]["_gee_collection"]
    
    # Also build a more permissive collection (up to 50% cloud cover)
    # to get more temporal observations
    start_date = col_base.aggregate_min("system:time_start")
    end_date = col_base.aggregate_max("system:time_start")
    
    col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(geom)
        .filterDate(ee.Date(start_date), ee.Date(end_date).advance(1, "day"))
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 50))
    )

    def _reduce_scene(img):
        img = ee.Image(img)
        scl = img.select("SCL")
        # Relaxed mask: vegetation(4), bare soil(5), water(6), unclassified(7)
        # This keeps more pixels valid during cloudy/rainy periods
        mask = scl.eq(4).Or(scl.eq(5)).Or(scl.eq(6)).Or(scl.eq(7))
        bands = img.select(["B2", "B3", "B4", "B5", "B8", "B11"]).multiply(0.0001)
        nir = bands.select("B8")
        red = bands.select("B4")
        green = bands.select("B3")
        swir1 = bands.select("B11")
        re1 = bands.select("B5")

        ndvi = nir.subtract(red).divide(nir.add(red)).rename("NDVI")
        evi = nir.subtract(red).divide(nir.add(red.multiply(6)).subtract(bands.select("B2").multiply(7.5)).add(1)).multiply(2.5).rename("EVI")
        ndmi = nir.subtract(swir1).divide(nir.add(swir1)).rename("NDMI")
        gcvi = nir.divide(green).subtract(1).rename("GCVI")
        ndre = nir.subtract(re1).divide(nir.add(re1)).rename("NDRE")

        processed = ndvi.addBands([evi, ndmi, gcvi, ndre]).updateMask(mask)
        stats = processed.reduceRegion(
            reducer=ee.Reducer.median(),
            geometry=geom,
            scale=10,
            maxPixels=1e7,
            bestEffort=True,
        )
        return ee.Feature(None, stats).set("date", img.date().format("YYYY-MM-dd"))

    try:
        fc = col.map(_reduce_scene)
        results_raw = fc.getInfo()
    except Exception as e:
        logger.error("GEE time-series extraction failed: %s", e)
        return []

    results = []
    for feat in results_raw.get("features", []):
        props = feat.get("properties", {})
        ndvi_val = props.get("NDVI")
        # Skip scenes where all pixels were masked (null NDVI)
        if ndvi_val is None:
            continue
        results.append({
            "date": props.get("date", ""),
            "ndvi": float(ndvi_val),
            "evi": float(props.get("EVI") or 0),
            "ndmi": float(props.get("NDMI") or 0),
            "gcvi": float(props.get("GCVI") or 0),
            "ndre": float(props.get("NDRE") or 0),
        })

    results.sort(key=lambda r: r["date"])
    return results


def extract_pixel_grid(item: dict, geometry_geojson: dict) -> Optional[dict]:
    """Compute per-pixel NDVI grid for the composite, clipped to the polygon.

    Returns:
        {"ndvi_grid": [[float, ...], ...],
         "bbox": [minx, miny, maxx, maxy],
         "resolution_m": float,
         "rows": int, "cols": int}
    """
    _init_gee()
    from shapely.geometry import shape
    from pyproj import Transformer

    geom_ee = _geojson_to_ee_geometry(geometry_geojson)
    composite = item["_gee_image"]

    ndvi_img = composite.select("NDVI")

    try:
        # Sample NDVI at 10m resolution as a 2D array
        # Use getRegion for small areas (< ~1000 pixels)
        geom_shapely = shape(geometry_geojson)
        minx, miny, maxx, maxy = geom_shapely.bounds

        # Estimate pixel dimensions
        transformer = Transformer.from_crs("EPSG:4326", config.OUTPUT_CRS, always_xy=True)
        x_min, y_min = transformer.transform(minx, miny)
        x_max, y_max = transformer.transform(maxx, maxy)
        width_m = abs(x_max - x_min)
        height_m = abs(y_max - y_min)
        cols = max(int(width_m / 10), 1)
        rows = max(int(height_m / 10), 1)

        # Cap to prevent huge downloads
        if rows * cols > 10000:
            scale = 20
            cols = max(int(width_m / scale), 1)
            rows = max(int(height_m / scale), 1)
        else:
            scale = 10

        # Use computePixels or sampleRectangle
        rect = ee.Geometry.Rectangle([minx, miny, maxx, maxy])
        arr = ndvi_img.clip(geom_ee).sampleRectangle(
            region=rect,
            defaultValue=-9999,
        ).get("NDVI").getInfo()

        if arr is None:
            return None

        ndvi_grid = np.array(arr, dtype=np.float64)
        # Replace sentinel value with NaN
        ndvi_grid[ndvi_grid == -9999] = float("nan")

        # Filter invalid
        valid_mask = np.isfinite(ndvi_grid) & (ndvi_grid >= -1) & (ndvi_grid <= 1)
        if int(np.sum(valid_mask)) < 4:
            return None

        ndvi_grid = np.where(valid_mask, np.clip(ndvi_grid, -1.0, 1.0), float("nan"))
        actual_rows, actual_cols = ndvi_grid.shape

        resolution_m = max(width_m / max(actual_cols, 1), height_m / max(actual_rows, 1))

        return {
            "ndvi_grid": ndvi_grid.tolist(),
            "bbox": [minx, miny, maxx, maxy],
            "resolution_m": round(resolution_m, 2),
            "rows": actual_rows,
            "cols": actual_cols,
        }

    except Exception as e:
        logger.error("GEE pixel grid extraction failed: %s", e)
        return None


def extract_true_color_thumbnail(item: dict, geometry_geojson: dict) -> Optional[str]:
    """Generate a true-color PNG thumbnail from the composite.

    Returns a base64-encoded PNG string, or None on failure.
    """
    _init_gee()

    geom_ee = _geojson_to_ee_geometry(geometry_geojson)
    composite = item["_gee_image"]

    try:
        rgb = composite.select(["B4", "B3", "B2"])

        # Get thumbnail URL from GEE
        thumb_url = rgb.getThumbURL({
            "region": geom_ee,
            "dimensions": "256x256",
            "min": 0,
            "max": 0.3,
            "format": "png",
        })

        # Download the thumbnail
        import requests
        resp = requests.get(thumb_url, timeout=15)
        resp.raise_for_status()

        return base64.b64encode(resp.content).decode("utf-8")

    except Exception as e:
        logger.error("GEE thumbnail generation failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Map Tile URLs for frontend display
# ---------------------------------------------------------------------------

def _get_nanton_roi() -> ee.Geometry:
    """Get the Nanton district ROI used for training."""
    districts = ee.FeatureCollection("WM/geoLab/geoBoundaries/600/ADM2")
    roi = districts.filter(
        ee.Filter.And(
            ee.Filter.eq("shapeGroup", "GHA"),
            ee.Filter.eq("shapeName", "Nanton"),
        )
    )
    return roi.geometry()


def _build_training_image(year: int) -> ee.Image:
    """Build the full predictor image over the Nanton training region.

    This is used to sample training data — separate from the user's polygon.
    """
    roi = _get_nanton_roi()
    start = ee.Date.fromYMD(year, 6, 1)
    end = ee.Date.fromYMD(year, 10, 31)

    spectral = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(roi)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
        .map(_preprocess_s2)
        .qualityMosaic("NDVI")
        .clip(roi)
    )

    terrain = ee.Algorithms.Terrain(ee.Image("USGS/SRTMGL1_003"))
    topo = terrain.select(["elevation", "slope"]).clip(roi)
    rain = ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD").filterDate(start, end).sum().clip(roi).rename("precip")
    soil = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select("b0").clip(roi).rename("SOC")
    temp = (
        ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
        .filterDate(start, end)
        .select("temperature_2m_max")
        .mean()
        .subtract(273.15)
        .clip(roi)
        .rename("temp_max")
    )

    return spectral.addBands(topo).addBands(rain).addBands(soil).addBands(temp)


_ALL_PREDICTORS = [
    "NDVI", "LSWI", "NDRE", "B4", "B8", "B11",
    "EVI", "GCVI", "NDMI", "MTCI",
    "elevation", "slope", "precip", "SOC", "temp_max",
]


def get_classification_map_url(geometry_geojson: dict, year: int) -> Optional[dict]:
    """Generate a GEE map tile URL for the classification layer.

    Trains the classifier on the Nanton training region, then applies it
    to the user's polygon area.
    """
    _init_gee()
    geom = _geojson_to_ee_geometry(geometry_geojson)

    try:
        # 1. Build training image over Nanton (where training points are)
        training_image = _build_training_image(year)

        # 2. Load training data
        maize_pts = ee.FeatureCollection("projects/ghana-project-73326/assets/maize_cleaned_2021_2023")
        rice_pts = ee.FeatureCollection("projects/ghana-project-73326/assets/Rice50fields")
        maize = maize_pts.map(lambda f: f.set("class", 1))
        non_maize = rice_pts.map(lambda f: f.set("class", 0))
        training = maize.merge(non_maize)

        # 3. Sample training data from the TRAINING image (Nanton region)
        samples = training_image.select(_ALL_PREDICTORS).sampleRegions(
            collection=training, properties=["class"], scale=10
        )

        # 4. Train classifier
        classifier = ee.Classifier.smileRandomForest(100).train(
            features=samples, classProperty="class", inputProperties=_ALL_PREDICTORS
        )

        # 5. Build predictor image for the USER's polygon
        user_composite = _get_season_composite(geom, year)
        terrain = ee.Algorithms.Terrain(ee.Image("USGS/SRTMGL1_003"))
        topo = terrain.select(["elevation", "slope"]).clip(geom)
        start = ee.Date.fromYMD(year, 6, 1)
        end = ee.Date.fromYMD(year, 10, 31)
        rain = ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD").filterDate(start, end).sum().clip(geom).rename("precip")
        soil = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select("b0").clip(geom).rename("SOC")
        temp = (
            ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
            .filterDate(start, end)
            .select("temperature_2m_max")
            .mean()
            .subtract(273.15)
            .clip(geom)
            .rename("temp_max")
        )
        user_image = user_composite.addBands(topo).addBands(rain).addBands(soil).addBands(temp)

        # 6. Apply classifier to user's area
        classified = user_image.classify(classifier)

        vis_params = {
            "min": 0,
            "max": 1,
            "palette": ["#3b82f6", "#10b981"],
        }
        map_id = classified.getMapId(vis_params)

        return {
            "tile_url": map_id["tile_fetcher"].url_format,
            "legend": [
                {"label": "Non-Maize / Rice", "color": "#3b82f6"},
                {"label": "Maize", "color": "#10b981"},
            ],
        }

    except Exception as e:
        logger.error("Classification map generation failed: %s", e)
        return None


def get_yield_map_url(geometry_geojson: dict, year: int) -> Optional[dict]:
    """Generate a GEE map tile URL for the yield prediction layer.

    Trains both classifier and regressor on Nanton, applies to user's polygon.
    """
    _init_gee()
    geom = _geojson_to_ee_geometry(geometry_geojson)

    try:
        # 1. Build training image over Nanton
        training_image = _build_training_image(year)

        # 2. Load training data
        maize_pts = ee.FeatureCollection("projects/ghana-project-73326/assets/maize_cleaned_2021_2023")
        rice_pts = ee.FeatureCollection("projects/ghana-project-73326/assets/Rice50fields")
        maize = maize_pts.map(lambda f: f.set("class", 1))
        non_maize = rice_pts.map(lambda f: f.set("class", 0))
        training = maize.merge(non_maize)

        # 3. Train classifier on Nanton training image
        class_samples = training_image.select(_ALL_PREDICTORS).sampleRegions(
            collection=training, properties=["class"], scale=10
        )
        classifier = ee.Classifier.smileRandomForest(100).train(
            features=class_samples, classProperty="class", inputProperties=_ALL_PREDICTORS
        )

        # 4. Train yield regressor on Nanton training image
        yield_samples = training_image.select(_ALL_PREDICTORS).sampleRegions(
            collection=maize_pts, properties=["yield_kg_h"], scale=10
        ).filter(ee.Filter.notNull(_ALL_PREDICTORS + ["yield_kg_h"]))

        regressor = (
            ee.Classifier.smileRandomForest(numberOfTrees=500, variablesPerSplit=8, minLeafPopulation=2)
            .setOutputMode("REGRESSION")
            .train(features=yield_samples, classProperty="yield_kg_h", inputProperties=_ALL_PREDICTORS)
        )

        # 5. Build predictor image for user's polygon
        user_composite = _get_season_composite(geom, year)
        terrain = ee.Algorithms.Terrain(ee.Image("USGS/SRTMGL1_003"))
        topo = terrain.select(["elevation", "slope"]).clip(geom)
        start = ee.Date.fromYMD(year, 6, 1)
        end = ee.Date.fromYMD(year, 10, 31)
        rain = ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD").filterDate(start, end).sum().clip(geom).rename("precip")
        soil = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select("b0").clip(geom).rename("SOC")
        temp = (
            ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
            .filterDate(start, end)
            .select("temperature_2m_max")
            .mean()
            .subtract(273.15)
            .clip(geom)
            .rename("temp_max")
        )
        user_image = user_composite.addBands(topo).addBands(rain).addBands(soil).addBands(temp)

        # 6. Apply both models to user's area
        classified = user_image.classify(classifier)
        predicted_yield = user_image.classify(regressor)
        masked_yield = predicted_yield.updateMask(classified.eq(1))

        palette = ["red", "orange", "yellow", "green", "darkgreen"]
        vis_params = {"min": 1000, "max": 5500, "palette": palette}
        map_id = masked_yield.getMapId(vis_params)

        return {
            "tile_url": map_id["tile_fetcher"].url_format,
            "min": 1000,
            "max": 5500,
            "unit": "kg/ha",
            "palette": palette,
        }

    except Exception as e:
        logger.error("Yield map generation failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# GEE-based classification (replaces local joblib model)
# ---------------------------------------------------------------------------

def classify_farm_gee(geometry_geojson: dict, year: int) -> Optional[dict]:
    """Run GEE Random Forest classification on a farm polygon.

    Trains on Nanton training data, then classifies the user's polygon
    by computing the fraction of maize vs non-maize pixels.

    Returns:
        {"classification": "maize"|"non-maize",
         "confidence": float (0-1),
         "is_maize": bool,
         "maize_fraction": float,
         "pixel_count": int,
         "maize_pixels": int}
    or None on failure.
    """
    _init_gee()
    geom = _geojson_to_ee_geometry(geometry_geojson)

    try:
        # Build training image over Nanton
        training_image = _build_training_image(year)

        # Load training data
        maize_pts = ee.FeatureCollection("projects/ghana-project-73326/assets/maize_cleaned_2021_2023")
        rice_pts = ee.FeatureCollection("projects/ghana-project-73326/assets/Rice50fields")
        maize = maize_pts.map(lambda f: f.set("class", 1))
        non_maize = rice_pts.map(lambda f: f.set("class", 0))
        training = maize.merge(non_maize)

        # Train classifier on Nanton
        samples = training_image.select(_ALL_PREDICTORS).sampleRegions(
            collection=training, properties=["class"], scale=10
        )
        classifier = ee.Classifier.smileRandomForest(100).train(
            features=samples, classProperty="class", inputProperties=_ALL_PREDICTORS
        )

        # Build image for user's polygon
        user_composite = _get_season_composite(geom, year)
        terrain = ee.Algorithms.Terrain(ee.Image("USGS/SRTMGL1_003"))
        topo = terrain.select(["elevation", "slope"]).clip(geom)
        start = ee.Date.fromYMD(year, 6, 1)
        end = ee.Date.fromYMD(year, 10, 31)
        rain = ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD").filterDate(start, end).sum().clip(geom).rename("precip")
        soil = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select("b0").clip(geom).rename("SOC")
        temp = (
            ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
            .filterDate(start, end)
            .select("temperature_2m_max")
            .mean()
            .subtract(273.15)
            .clip(geom)
            .rename("temp_max")
        )
        user_image = user_composite.addBands(topo).addBands(rain).addBands(soil).addBands(temp)

        # Classify user's polygon
        classified = user_image.classify(classifier)

        # Count maize vs non-maize pixels
        stats = classified.reduceRegion(
            reducer=ee.Reducer.frequencyHistogram(),
            geometry=geom,
            scale=10,
            maxPixels=1e7,
            bestEffort=True,
        ).getInfo()

        histogram = stats.get("classification", {})
        maize_count = int(histogram.get("1", 0) or 0)
        non_maize_count = int(histogram.get("0", 0) or 0)
        total = maize_count + non_maize_count

        if total == 0:
            return None

        maize_fraction = maize_count / total
        is_maize = maize_fraction >= 0.5
        confidence = maize_fraction if is_maize else (1 - maize_fraction)

        # Also run yield regression if maize
        yield_kg_ha = None
        if is_maize:
            try:
                yield_samples = training_image.select(_ALL_PREDICTORS).sampleRegions(
                    collection=maize_pts, properties=["yield_kg_h"], scale=10
                ).filter(ee.Filter.notNull(_ALL_PREDICTORS + ["yield_kg_h"]))

                regressor = (
                    ee.Classifier.smileRandomForest(numberOfTrees=500, variablesPerSplit=8, minLeafPopulation=2)
                    .setOutputMode("REGRESSION")
                    .train(features=yield_samples, classProperty="yield_kg_h", inputProperties=_ALL_PREDICTORS)
                )

                yield_img = user_image.classify(regressor)
                yield_stats = yield_img.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=geom,
                    scale=10,
                    maxPixels=1e7,
                    bestEffort=True,
                ).getInfo()
                yield_kg_ha = yield_stats.get("classification")
            except Exception as e:
                logger.warning("GEE yield regression failed: %s", e)

        return {
            "classification": "maize" if is_maize else "non-maize",
            "confidence": round(confidence, 4),
            "is_maize": is_maize,
            "maize_fraction": round(maize_fraction, 4),
            "pixel_count": total,
            "maize_pixels": maize_count,
            "yield_kg_ha": yield_kg_ha,
        }

    except Exception as e:
        logger.error("GEE farm classification failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Administrative Boundaries from GEE
# ---------------------------------------------------------------------------

def get_ghana_boundaries(admin_level: int = 2) -> Optional[list]:
    """Fetch Ghana administrative boundaries from GEE geoBoundaries.
    
    admin_level: 1 = regions, 2 = districts
    Returns list of {id, name, coordinates: [[lat, lng], ...]}
    """
    _init_gee()
    
    try:
        # Use different sources for regions vs districts
        # geoBoundaries has updated 16 regions, GAUL has smoother district boundaries
        if admin_level == 1:
            # Regions — use geoBoundaries (has 16 regions post-2018)
            collection_id = "WM/geoLab/geoBoundaries/600/ADM1"
            boundaries = ee.FeatureCollection(collection_id).filter(
                ee.Filter.eq("shapeGroup", "GHA")
            )
        else:
            # Districts — use GAUL (smoother boundaries)
            collection_id = "FAO/GAUL/2015/level2"
            boundaries = ee.FeatureCollection(collection_id).filter(
                ee.Filter.eq("ADM0_NAME", "Ghana")
            )
        
        features = boundaries.getInfo()
        
        if not features or "features" not in features:
            return None
        
        result = []
        for feat in features["features"]:
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            
            # Handle different property names from different datasets
            if admin_level == 1:
                # geoBoundaries uses shapeName/shapeID
                name = props.get("shapeName", "Unknown")
                feat_id = props.get("shapeID", f"adm1-{len(result)}")
            else:
                # GAUL uses ADM2_NAME/ADM2_CODE
                name = props.get(f"ADM{admin_level}_NAME", props.get("shapeName", "Unknown"))
                feat_id = props.get(f"ADM{admin_level}_CODE", props.get("shapeID", f"adm{admin_level}-{len(result)}"))
            
            coords = []
            if geom.get("type") == "Polygon":
                ring = geom["coordinates"][0]
                coords = [[c[1], c[0]] for c in ring]  # [lat, lng] — no simplification
            elif geom.get("type") == "MultiPolygon":
                # Take the largest polygon
                largest = max(geom["coordinates"], key=lambda p: len(p[0]))
                ring = largest[0]
                coords = [[c[1], c[0]] for c in ring]
            
            if coords:
                result.append({
                    "id": str(feat_id),
                    "name": name,
                    "coordinates": coords,
                })
        
        return result
    
    except Exception as e:
        logger.error("Failed to fetch Ghana boundaries: %s", e)
        return None
