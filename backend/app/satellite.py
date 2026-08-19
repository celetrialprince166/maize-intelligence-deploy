"""Fetch and process Sentinel-2 imagery from Earth Search STAC."""
import numpy as np
import rasterio
from rasterio.mask import mask as rio_mask
from rasterio.warp import calculate_default_transform, reproject, Resampling
from shapely.geometry import shape, mapping
from pyproj import Transformer
import pystac_client
from datetime import datetime, timedelta
import tempfile
import os

from . import config


def search_sentinel2(geometry_geojson: dict, days_back: int = None):
    """Search for recent Sentinel-2 scenes covering the given geometry."""
    days_back = days_back or config.DEFAULT_DAYS_BACK
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days_back)

    client = pystac_client.Client.open(config.STAC_URL)
    search = client.search(
        collections=[config.S2_COLLECTION],
        intersects=geometry_geojson,
        datetime=f"{start_date.date()}/{end_date.date()}",
        query={"eo:cloud_cover": {"lt": config.MAX_CLOUD_COVER}},
        sortby=[{"field": "properties.eo:cloud_cover", "direction": "asc"}],
        max_items=10,
    )
    return list(search.items())


def read_band(item, band_name: str, geometry_geojson: dict, target_shape=None) -> np.ndarray:
    """Read a single band from a STAC item, clipped to the geometry.
    If target_shape is provided, resample to match (handles 10m vs 20m bands).
    """
    asset_key = config.BAND_ASSETS.get(band_name, band_name)
    if asset_key not in item.assets:
        raise ValueError(f"Band '{asset_key}' not found in item assets: {list(item.assets.keys())}")

    href = item.assets[asset_key].href
    # Enable GDAL's virtual filesystem for efficient HTTP range requests on COGs
    import os
    os.environ.setdefault('GDAL_HTTP_MERGE_CONSECUTIVE_RANGES', 'YES')
    os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
    os.environ.setdefault('VSI_CACHE', 'TRUE')
    os.environ.setdefault('VSI_CACHE_SIZE', '5000000')

    with rasterio.open(href) as src:
        # Reproject geometry to match raster CRS
        geom_wgs84 = shape(geometry_geojson)
        if src.crs and str(src.crs) != "EPSG:4326":
            transformer = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
            from shapely.ops import transform as shapely_transform
            geom_native = shapely_transform(lambda x, y: transformer.transform(x, y), geom_wgs84)
        else:
            geom_native = geom_wgs84

        out_image, out_transform = rio_mask(src, [mapping(geom_native)], crop=True, all_touched=True)
        data = out_image[0].astype(np.float32)
        
        # Resample to target shape if needed (e.g., 20m band to match 10m band)
        if target_shape is not None and data.shape != target_shape:
            # Use numpy repeat/slice for simple resampling (avoids scipy dependency)
            zoom_y = target_shape[0] / data.shape[0]
            zoom_x = target_shape[1] / data.shape[1]
            if zoom_y > 1 or zoom_x > 1:
                # Upsample with repeat
                data = np.repeat(np.repeat(data, int(round(zoom_y)), axis=0), int(round(zoom_x)), axis=1)
            # Crop or pad to exact target shape
            data = data[:target_shape[0], :target_shape[1]]
            if data.shape[0] < target_shape[0] or data.shape[1] < target_shape[1]:
                padded = np.zeros(target_shape, dtype=data.dtype)
                padded[:data.shape[0], :data.shape[1]] = data
                data = padded
        
        return data


def extract_spectral_features(item, geometry_geojson: dict) -> dict:
    """Extract all spectral bands and compute vegetation indices for a polygon."""
    # Read NIR first as reference shape (10m resolution)
    try:
        nir = read_band(item, "nir", geometry_geojson)
    except Exception as e:
        print(f"  Failed to read NIR: {e}")
        return None
    
    ref_shape = nir.shape
    
    # Read remaining bands, resampling 20m bands to match 10m NIR
    bands = {"nir": nir}
    for band_name in ["red", "green", "blue", "swir_1", "red_edge_1", "red_edge_2", "red_edge_3"]:
        try:
            bands[band_name] = read_band(item, band_name, geometry_geojson, target_shape=ref_shape)
        except Exception as e:
            print(f"  Warning: could not read {band_name}: {e}")
            bands[band_name] = None

    red = bands.get("red")
    green = bands.get("green")
    swir1 = bands.get("swir_1")
    re1 = bands.get("red_edge_1")
    re2 = bands.get("red_edge_2")

    if red is None or nir is None:
        return None

    eps = 1e-10

    ndvi = (nir - red) / (nir + red + eps)
    evi = 2.5 * (nir - red) / (nir + 6 * red - 7.5 * (bands.get("blue") if bands.get("blue") is not None else 0) + 1 + eps)
    ndmi = (nir - swir1) / (nir + swir1 + eps) if swir1 is not None else np.full_like(nir, np.nan)
    gcvi = (nir / (green + eps)) - 1 if green is not None else np.full_like(nir, np.nan)
    lswi = (nir - swir1) / (nir + swir1 + eps) if swir1 is not None else np.full_like(nir, np.nan)
    ndre = (nir - re1) / (nir + re1 + eps) if re1 is not None else np.full_like(nir, np.nan)
    mtci = (re2 - re1) / (re1 - red + eps) if (re1 is not None and re2 is not None) else np.full_like(nir, np.nan)
    mtci = np.clip(mtci, -10, 10)

    features = {
        "NDVI": float(np.nanmedian(ndvi)),
        "EVI": float(np.nanmedian(evi)),
        "NDMI": float(np.nanmedian(ndmi)),
        "GCVI": float(np.nanmedian(gcvi)),
        "LSWI": float(np.nanmedian(lswi)),
        "NDRE": float(np.nanmedian(ndre)),
        "MTCI": float(np.nanmedian(mtci)),
        "B4_red": float(np.nanmedian(red)),
        "B8_nir": float(np.nanmedian(nir)),
        "B11_swir1": float(np.nanmedian(swir1)) if swir1 is not None else np.nan,
    }
    return features


def search_sentinel2_season(geometry_geojson: dict, year: int) -> list:
    """Search for ALL Sentinel-2 scenes covering the polygon within the
    growing season (June 1 – October 31) of the given year, filtered by
    cloud cover < MAX_CLOUD_COVER, sorted by date ascending.

    Returns a list of pystac Item objects sorted by acquisition date.
    """
    start_date = f"{year}-06-01"
    end_date = f"{year}-10-31"

    client = pystac_client.Client.open(config.STAC_URL)
    search = client.search(
        collections=[config.S2_COLLECTION],
        intersects=geometry_geojson,
        datetime=f"{start_date}/{end_date}",
        query={"eo:cloud_cover": {"lt": config.MAX_CLOUD_COVER}},
        max_items=100,
    )
    items = list(search.items())

    # Sort by acquisition date ascending
    items.sort(key=lambda it: it.properties.get("datetime", ""))
    return items


def extract_time_series(items: list, geometry_geojson: dict) -> list[dict]:
    """For each STAC item, compute median NDVI, EVI, NDMI, GCVI, NDRE
    for the polygon.

    Returns a list of dicts:
        [{"date": "2023-07-15", "ndvi": 0.65, "evi": 0.42,
          "ndmi": ..., "gcvi": ..., "ndre": ...}, ...]

    Reuses the existing read_band() helper for band reading.
    """
    eps = 1e-10
    results = []

    for item in items:
        scene_date = item.properties.get("datetime", "")[:10]

        try:
            nir = read_band(item, "nir", geometry_geojson)
            ref_shape = nir.shape

            red = read_band(item, "red", geometry_geojson, target_shape=ref_shape)
            green = read_band(item, "green", geometry_geojson, target_shape=ref_shape)
            blue = read_band(item, "blue", geometry_geojson, target_shape=ref_shape)
            swir1 = read_band(item, "swir_1", geometry_geojson, target_shape=ref_shape)
            re1 = read_band(item, "red_edge_1", geometry_geojson, target_shape=ref_shape)

            ndvi = float(np.nanmedian((nir - red) / (nir + red + eps)))
            evi = float(np.nanmedian(
                2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1 + eps)
            ))
            ndmi = float(np.nanmedian((nir - swir1) / (nir + swir1 + eps)))
            gcvi = float(np.nanmedian((nir / (green + eps)) - 1))
            ndre = float(np.nanmedian((nir - re1) / (nir + re1 + eps)))

            results.append({
                "date": scene_date,
                "ndvi": ndvi,
                "evi": evi,
                "ndmi": ndmi,
                "gcvi": gcvi,
                "ndre": ndre,
            })
        except Exception as e:
            print(f"  Warning: skipping scene {scene_date}: {e}")
            # Still append an entry with NaN so output length matches input
            results.append({
                "date": scene_date,
                "ndvi": float("nan"),
                "evi": float("nan"),
                "ndmi": float("nan"),
                "gcvi": float("nan"),
                "ndre": float("nan"),
            })

    return results


def extract_pixel_grid(item, geometry_geojson: dict) -> dict | None:
    """Compute per-pixel NDVI for the best scene, clipped to the polygon.

    Returns:
        {"ndvi_grid": [[float, ...], ...],
         "bbox": [minx, miny, maxx, maxy],
         "resolution_m": float,
         "rows": int,
         "cols": int}

    Returns None if fewer than 4 valid (non-NaN) pixels.
    """
    eps = 1e-10

    try:
        nir = read_band(item, "nir", geometry_geojson)
        red = read_band(item, "red", geometry_geojson, target_shape=nir.shape)
    except Exception as e:
        print(f"  extract_pixel_grid: failed to read bands: {e}")
        return None

    ndvi = (nir - red) / (nir + red + eps)

    # Count valid (finite) pixels
    valid_mask = np.isfinite(ndvi) & (ndvi >= -1) & (ndvi <= 1)
    if int(np.sum(valid_mask)) < 4:
        return None

    # Clip NDVI to [-1, 1] and replace invalid with NaN
    ndvi = np.where(valid_mask, np.clip(ndvi, -1.0, 1.0), float("nan"))

    # Compute bounding box from the geometry
    geom = shape(geometry_geojson)
    minx, miny, maxx, maxy = geom.bounds

    rows, cols = ndvi.shape

    # Estimate resolution from bbox and pixel dimensions
    transformer = Transformer.from_crs("EPSG:4326", config.OUTPUT_CRS, always_xy=True)
    x_min, y_min = transformer.transform(minx, miny)
    x_max, y_max = transformer.transform(maxx, maxy)
    resolution_m = max(
        abs(x_max - x_min) / max(cols, 1),
        abs(y_max - y_min) / max(rows, 1),
    )

    return {
        "ndvi_grid": ndvi.tolist(),
        "bbox": [minx, miny, maxx, maxy],
        "resolution_m": round(resolution_m, 2),
        "rows": rows,
        "cols": cols,
    }


def extract_true_color_thumbnail(item, geometry_geojson: dict) -> str | None:
    """Read B4 (red), B3 (green), B2 (blue) bands, clip to polygon,
    normalize to 0-255 uint8, and return as a base64-encoded PNG string
    for PDF embedding.

    Returns None if band reading fails.
    """
    import base64
    from io import BytesIO
    from PIL import Image

    try:
        red = read_band(item, "red", geometry_geojson)
        ref_shape = red.shape
        green = read_band(item, "green", geometry_geojson, target_shape=ref_shape)
        blue = read_band(item, "blue", geometry_geojson, target_shape=ref_shape)
    except Exception as e:
        print(f"  extract_true_color_thumbnail: failed to read bands: {e}")
        return None

    # Stack into RGB array (H, W, 3)
    rgb = np.stack([red, green, blue], axis=-1)

    # Normalize to 0-255 using 2nd and 98th percentile for contrast stretch
    valid = rgb[np.isfinite(rgb)]
    if valid.size == 0:
        return None

    p2 = np.percentile(valid, 2)
    p98 = np.percentile(valid, 98)
    if p98 - p2 < 1e-6:
        # Flat image — avoid division by zero
        rgb_norm = np.zeros_like(rgb, dtype=np.uint8)
    else:
        rgb_norm = np.clip((rgb - p2) / (p98 - p2) * 255, 0, 255).astype(np.uint8)

    # Replace NaN pixels with black
    nan_mask = ~np.isfinite(rgb)
    rgb_norm[nan_mask] = 0

    img = Image.fromarray(rgb_norm, mode="RGB")

    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")
