from __future__ import annotations

"""AI-assisted underground/subsurface anomaly screening.

This module deliberately does NOT claim to directly detect buried structures.
The supplied DEM/DSM + parcel data are surface/elevation records. The model
uses Isolation Forest to flag parcels whose combined geometry/elevation/
property features are unusual within the supplied dataset. Explicit basement
records from the floor-plan/ownership CSV are reported separately as source
 evidence.
"""

from typing import Any
import math

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


def _area_and_perimeter(coords: list[dict[str, float]]) -> tuple[float, float]:
    if len(coords) < 3:
        return 0.0, 0.0
    lat0 = math.radians(sum(p["lat"] for p in coords) / len(coords))
    kx = 111320.0 * math.cos(lat0)
    ky = 111320.0
    xy = [(p["lon"] * kx, p["lat"] * ky) for p in coords]
    area = abs(sum(xy[i][0] * xy[(i + 1) % len(xy)][1] - xy[(i + 1) % len(xy)][0] * xy[i][1] for i in range(len(xy))) / 2.0)
    perimeter = sum(math.hypot(xy[(i + 1) % len(xy)][0] - xy[i][0], xy[(i + 1) % len(xy)][1] - xy[i][1]) for i in range(len(xy)))
    return area, perimeter


def _feature_vector(parcel: dict[str, Any]) -> list[float]:
    area, perimeter = _area_and_perimeter(parcel.get("coordinates") or [])
    floors = parcel.get("detected_floors") or parcel.get("declared_floors") or 0
    return [
        area,
        perimeter,
        float(parcel.get("num_vertices") or 0),
        float(parcel.get("building_height_m") or 0),
        float(parcel.get("elevation_dem_m") or 0),
        float(parcel.get("elevation_dsm_m") or 0),
        float(parcel.get("ndsm_m") or 0),
        float(floors),
        float(parcel.get("unit_count") or 0),
        1.0 if "commercial" in str(parcel.get("building_type", "")).lower() or "shop" in str(parcel.get("building_type", "")).lower() else 0.0,
    ]


def _has_explicit_underground(parcel: dict[str, Any]) -> bool:
    text = " ".join([
        str(parcel.get("name", "")),
        str(parcel.get("building_type", "")),
        str((parcel.get("ownership") or {}).get("category", "")),
        str((parcel.get("ownership") or {}).get("notes", "")),
        " ".join(str(u.get("floor_label", "")) for u in parcel.get("floor_plan_units", [])),
        " ".join(str(u.get("unit_type", "")) for u in parcel.get("floor_plan_units", [])),
    ]).lower()
    return any(token in text for token in ("basement", "underground", "underground -1", "underground structure"))


def analyze_underground(parcel: dict[str, Any], records: list[dict[str, Any]]) -> dict[str, Any]:
    usable = [r for r in records if r.get("type") == "Polygon"]
    if len(usable) < 5:
        raise ValueError("At least 5 polygon records are required for the anomaly model.")

    X = np.asarray([_feature_vector(r) for r in usable], dtype=float)
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)
    model = IsolationForest(
        n_estimators=250,
        contamination="auto",
        random_state=42,
    )
    model.fit(Xs)

    target_x = scaler.transform(np.asarray([_feature_vector(parcel)], dtype=float))
    raw = float(model.decision_function(target_x)[0])
    all_raw = model.decision_function(Xs)
    lo, hi = float(all_raw.min()), float(all_raw.max())
    normalized = 0.5 if abs(hi - lo) < 1e-9 else 1.0 - ((raw - lo) / (hi - lo))
    anomaly_score = round(max(0.0, min(100.0, normalized * 100.0)), 1)

    explicit = _has_explicit_underground(parcel)
    if explicit:
        evidence = "Explicit underground/basement record in supplied property inventory"
        screening = round(min(100.0, 70.0 + anomaly_score * 0.30), 1)
        status = "SOURCE-SUPPORTED + ML SCREENING"
    else:
        evidence = "No direct underground record found; ML only flags surface/property anomaly"
        screening = round(anomaly_score, 1)
        status = "ML SCREENING — NOT MEASURED"

    return {
        "parcel": parcel["name"],
        "model": "Isolation Forest",
        "model_purpose": "Subsurface anomaly screening from supplied parcel/elevation/property features",
        "ml_anomaly_score": anomaly_score,
        "screening_score": screening,
        "explicit_underground_record": explicit,
        "evidence": evidence,
        "status": status,
        "estimated_depth_m": None,
        "data_limitations": [
            "DEM/DSM are surface/elevation observations and do not directly measure underground structures.",
            "The current supplied dataset has very few underground-labeled records; this is a prototype screening model, not a trained detector.",
            "GPR, borehole, utility survey, BIM/IFC or other subsurface observations are required for direct underground verification.",
        ],
        "features_used": [
            "parcel area and perimeter",
            "vertex count",
            "building height",
            "DEM / DSM / nDSM",
            "floor count",
            "unit count",
            "building-use signal",
        ],
    }
