from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from backend.features import (
    extract_color,
    extract_composition,
    extract_pose,
    pose_similarity,
)

DEFAULT_WEIGHTS: dict[str, Any] = {
    "sources": {"embeddings": 0.46, "composition": 0.22, "color": 0.22, "pose": 0.10},
    "enabled": {"embeddings": True, "composition": True, "color": True, "pose": True},
    "composition": {"saliency": 0.70, "edges": 0.30},
    "color": {"lab": 0.40, "palette": 0.30, "warmcool": 0.10, "contrast": 0.20},
}


@dataclass
class FeatureStore:
    ids: np.ndarray
    metadata: list[dict[str, Any]]
    embeddings: np.ndarray
    saliency: np.ndarray
    edges: np.ndarray
    lab: np.ndarray
    palette: np.ndarray
    warmcool: np.ndarray
    contrast: np.ndarray
    has_pose: np.ndarray
    pose: np.ndarray
    calibration: dict[str, dict[str, float]]


def normalize_rows(x: np.ndarray) -> np.ndarray:
    return x / (np.linalg.norm(x, axis=1, keepdims=True) + 1e-9)


def load_feature_store(path: str) -> FeatureStore:
    data = np.load(path, allow_pickle=True)
    calibration = data["calibration"].item() if "calibration" in data else {}
    return FeatureStore(
        ids=data["ids"],
        metadata=list(data["metadata"]),
        embeddings=normalize_rows(data["embeddings"].astype(np.float32)),
        saliency=normalize_rows(data["saliency"].astype(np.float32)),
        edges=normalize_rows(data["edges"].astype(np.float32)),
        lab=normalize_rows(data["lab"].astype(np.float32)),
        palette=normalize_rows(data["palette"].astype(np.float32)),
        warmcool=normalize_rows(data["warmcool"].astype(np.float32)),
        contrast=normalize_rows(data["contrast"].astype(np.float32)),
        has_pose=data["has_pose"].astype(bool),
        pose=data["pose"].astype(np.float32),
        calibration=calibration,
    )


def _merge_weights(weights: dict[str, Any] | None) -> dict[str, Any]:
    merged = {
        "sources": DEFAULT_WEIGHTS["sources"].copy(),
        "enabled": DEFAULT_WEIGHTS["enabled"].copy(),
        "composition": DEFAULT_WEIGHTS["composition"].copy(),
        "color": DEFAULT_WEIGHTS["color"].copy(),
    }
    if weights:
        for key in merged:
            merged[key].update(weights.get(key, {}))
    return merged


def _weighted(parts: dict[str, np.ndarray], weights: dict[str, float]) -> np.ndarray:
    active = {k: float(weights.get(k, 0.0)) for k in parts if float(weights.get(k, 0.0)) > 0}
    total = sum(active.values())
    if total <= 0:
        return np.zeros(len(next(iter(parts.values()))), dtype=np.float32)
    out = np.zeros(len(next(iter(parts.values()))), dtype=np.float32)
    for key, weight in active.items():
        out += parts[key] * (weight / total)
    return out


def calibrate(raw: np.ndarray, stats: dict[str, float] | None) -> np.ndarray:
    if not stats:
        return np.clip((raw + 1.0) / 2.0, 0.0, 1.0).astype(np.float32)
    lo = float(stats.get("p05", stats.get("min", -1.0)))
    hi = float(stats.get("p95", stats.get("max", 1.0)))
    if hi <= lo:
        return np.clip(raw, 0.0, 1.0).astype(np.float32)
    return np.clip((raw - lo) / (hi - lo), 0.0, 1.0).astype(np.float32)


def query_feature_blocks(image_bgr: np.ndarray, embedding: np.ndarray) -> dict[str, Any]:
    return {
        "embedding": embedding,
        "composition": extract_composition(image_bgr),
        "color": extract_color(image_bgr),
        "pose": extract_pose(image_bgr),
    }


def score_query(store: FeatureStore, query: dict[str, Any], weights: dict[str, Any] | None = None) -> dict[str, np.ndarray]:
    w = _merge_weights(weights)
    raw_embed = store.embeddings @ query["embedding"]
    raw_sal = store.saliency @ query["composition"]["saliency"]
    raw_edges = store.edges @ query["composition"]["edges"]
    raw_lab = store.lab @ query["color"]["lab"]
    raw_palette = store.palette @ query["color"]["palette"]
    raw_warmcool = store.warmcool @ query["color"]["warmcool"]
    raw_contrast = store.contrast @ query["color"]["contrast"]
    raw_pose = pose_similarity(query["pose"]["pose"], store.pose, store.has_pose)

    source = {
        "embeddings": calibrate(raw_embed, store.calibration.get("embeddings")),
        "saliency": calibrate(raw_sal, store.calibration.get("saliency")),
        "edges": calibrate(raw_edges, store.calibration.get("edges")),
        "lab": calibrate(raw_lab, store.calibration.get("lab")),
        "palette": calibrate(raw_palette, store.calibration.get("palette")),
        "warmcool": calibrate(raw_warmcool, store.calibration.get("warmcool")),
        "contrast": calibrate(raw_contrast, store.calibration.get("contrast")),
        "pose": calibrate(np.nan_to_num(raw_pose, nan=0.0), store.calibration.get("pose")),
    }
    composition = _weighted({"saliency": source["saliency"], "edges": source["edges"]}, w["composition"])
    color = _weighted(
        {
            "lab": source["lab"],
            "palette": source["palette"],
            "warmcool": source["warmcool"],
            "contrast": source["contrast"],
        },
        w["color"],
    )
    top = {
        "embeddings": source["embeddings"],
        "composition": composition,
        "color": color,
        "pose": source["pose"],
    }
    total = np.zeros(len(store.ids), dtype=np.float32)
    active_weight_sum = np.zeros(len(store.ids), dtype=np.float32)
    for name, scores in top.items():
        if not w["enabled"].get(name, True):
            continue
        weight = float(w["sources"].get(name, 0.0))
        if weight <= 0:
            continue
        valid = np.ones(len(store.ids), dtype=bool)
        if name == "pose":
            valid = np.isfinite(raw_pose)
        total[valid] += scores[valid] * weight
        active_weight_sum[valid] += weight
    total = np.divide(total, active_weight_sum, out=np.zeros_like(total), where=active_weight_sum > 0)
    return {**source, "composition": composition, "color": color, "total": total, "pose_valid": np.isfinite(raw_pose)}


def calibration_from_arrays(arrays: dict[str, np.ndarray]) -> dict[str, dict[str, float]]:
    stats = {}
    for key, values in arrays.items():
        finite = np.asarray(values, dtype=np.float32)
        finite = finite[np.isfinite(finite)]
        if len(finite) == 0:
            stats[key] = {"p05": 0.0, "p95": 1.0}
        else:
            stats[key] = {"p05": float(np.percentile(finite, 5)), "p95": float(np.percentile(finite, 95))}
    return stats
