"""District-level aggregation and farm comparison utilities."""
from collections import defaultdict


def compute_district_summary(
    farms: list[dict], districts: list[dict]
) -> list[dict]:
    """Compute per-district aggregated metrics.

    Args:
        farms: List of farm dicts, each with keys: yield, ndvi (or NDVI),
               area, district.
        districts: List of district dicts, each with keys: id, name.

    Returns:
        List of dicts with keys: district_id, district_name, avg_yield,
        avg_ndvi, farm_count, total_area_ha.
        Districts with no farms are omitted.
    """
    if not farms:
        return []

    district_name_map = {d["id"]: d["name"] for d in districts}

    # Group farms by district
    grouped: dict[str, list[dict]] = defaultdict(list)
    for farm in farms:
        district_id = farm.get("district")
        if district_id is not None:
            grouped[district_id].append(farm)

    results = []
    for district_id, district_farms in grouped.items():
        district_name = district_name_map.get(district_id, district_id)
        count = len(district_farms)

        total_yield = sum(f.get("yield", 0) for f in district_farms)
        total_ndvi = sum(
            f.get("ndvi", f.get("NDVI", 0)) for f in district_farms
        )
        total_area = sum(f.get("area", 0) for f in district_farms)

        results.append(
            {
                "district_id": str(district_id),
                "district_name": district_name,
                "avg_yield": total_yield / count,
                "avg_ndvi": total_ndvi / count,
                "farm_count": count,
                "total_area_ha": total_area,
            }
        )

    return results


def compute_farm_comparison(
    farm: dict, district_farms: list[dict]
) -> dict:
    """Compute a farm's percentile rank and delta vs district average.

    Args:
        farm: Target farm dict with keys: yield, ndvi (or NDVI).
        district_farms: List of farm dicts in the same district.

    Returns:
        Dict with keys: district_avg_yield, district_avg_ndvi,
        yield_percentile, ndvi_delta.
        If district_farms is empty, all values are 0.
    """
    if not district_farms:
        return {
            "district_avg_yield": 0.0,
            "district_avg_ndvi": 0.0,
            "yield_percentile": 0.0,
            "ndvi_delta": 0.0,
        }

    count = len(district_farms)
    farm_yield = farm.get("yield", 0)
    farm_ndvi = farm.get("ndvi", farm.get("NDVI", 0))

    district_yields = [f.get("yield", 0) for f in district_farms]
    district_ndvis = [
        f.get("ndvi", f.get("NDVI", 0)) for f in district_farms
    ]

    avg_yield = sum(district_yields) / count
    avg_ndvi = sum(district_ndvis) / count

    # Percentile: percentage of district farms with yield <= target farm's yield
    farms_at_or_below = sum(1 for y in district_yields if y <= farm_yield)
    yield_percentile = (farms_at_or_below / count) * 100

    ndvi_delta = farm_ndvi - avg_ndvi

    return {
        "district_avg_yield": avg_yield,
        "district_avg_ndvi": avg_ndvi,
        "yield_percentile": yield_percentile,
        "ndvi_delta": ndvi_delta,
    }
