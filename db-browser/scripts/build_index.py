#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
METADATA_PATH = ROOT / "data/img-metadata-CC0-clean.csv"
FEATURE_PATH = ROOT / "data/features/artbutsports_features.npz"
OUT_PATH = Path(__file__).resolve().parents[1] / "public/data/index.json"


def clean(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"nan", "none", "[]"}:
        return ""
    return text


def safe_float(value: Any) -> float | None:
    try:
        if value in ("", None):
            return None
        out = float(value)
        if math.isnan(out):
            return None
        return out
    except (TypeError, ValueError):
        return None


def quantile_score(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    lo = float(np.nanpercentile(values, 5))
    hi = float(np.nanpercentile(values, 95))
    if hi <= lo:
        return np.zeros_like(values)
    return np.clip((values - lo) / (hi - lo), 0.0, 1.0)


def entropy_rows(mat: np.ndarray) -> np.ndarray:
    x = np.clip(mat.astype(np.float32), 0.0, None)
    x = x / (x.sum(axis=1, keepdims=True) + 1e-9)
    ent = -(x * np.log(x + 1e-9)).sum(axis=1)
    return ent / math.log(max(2, mat.shape[1]))


def saliency_bias(saliency: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    grid = saliency.reshape((saliency.shape[0], 16, 16)).astype(np.float32)
    total = grid.sum(axis=(1, 2)) + 1e-9
    xs = np.linspace(-1, 1, 16, dtype=np.float32)
    ys = np.linspace(-1, 1, 16, dtype=np.float32)
    x_bias = (grid.sum(axis=1) * xs).sum(axis=1) / total
    y_bias = (grid.sum(axis=2) * ys).sum(axis=1) / total
    center = grid[:, 5:11, 5:11].sum(axis=(1, 2)) / total
    return x_bias, y_bias, center


def load_metadata() -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    with METADATA_PATH.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            art_id = clean(row.get("id"))
            if art_id:
                rows[art_id] = row
    return rows


def top_facets(records: list[dict[str, Any]], field: str, limit: int = 80) -> list[dict[str, Any]]:
    counts = Counter(clean(record.get(field)) or "Unknown" for record in records)
    return [{"value": value, "count": count} for value, count in counts.most_common(limit)]


def main() -> None:
    meta_by_id = load_metadata()
    data = np.load(FEATURE_PATH, allow_pickle=True)
    ids = [str(item) for item in data["ids"]]
    feature_meta = [dict(item) for item in data["metadata"]]

    sal_entropy = entropy_rows(data["saliency"])
    palette_entropy = entropy_rows(data["palette"])
    x_bias, y_bias, center_focus = saliency_bias(data["saliency"])
    warm = data["warmcool"][:, 0].astype(np.float32)
    cool = data["warmcool"][:, 1].astype(np.float32)
    brightness = data["contrast"][:, 0].astype(np.float32)
    contrast = data["contrast"][:, 1].astype(np.float32)
    edge_vertical = data["edges"][:, [2, 3, 8, 9]].sum(axis=1).astype(np.float32)
    edge_horizontal = data["edges"][:, [0, 5, 6, 11]].sum(axis=1).astype(np.float32)
    pose_density = (data["pose"] >= 0).sum(axis=(1, 2)).astype(np.float32) / data["pose"].reshape((len(ids), -1)).shape[1]

    records: list[dict[str, Any]] = []
    for i, art_id in enumerate(ids):
        source = meta_by_id.get(art_id, {})
        feature_row = feature_meta[i]
        year = safe_float(source.get("creation_date_earliest"))
        latest = safe_float(source.get("creation_date_latest"))
        year_mid = None if year is None and latest is None else int(round(((year or latest or 0) + (latest or year or 0)) / 2))
        image_web = clean(source.get("image_web")) or clean(feature_row.get("image_web"))
        records.append(
            {
                "id": art_id,
                "accession": clean(source.get("accession_number")) or clean(feature_row.get("accession_number")),
                "title": clean(source.get("title")) or clean(feature_row.get("title")) or "Untitled",
                "creators": clean(source.get("creators")) or clean(feature_row.get("creators")),
                "culture": clean(source.get("culture")),
                "department": clean(source.get("department")),
                "collection": clean(source.get("collection")),
                "type": clean(source.get("type")),
                "technique": clean(source.get("technique")),
                "date": clean(source.get("creation_date")),
                "year": year_mid,
                "url": clean(source.get("url")) or clean(feature_row.get("url")),
                "image": image_web,
                "hasPose": bool(data["has_pose"][i]),
                "metrics": {
                    "warmth": round(float(quantile_score(warm - cool)[i]), 4),
                    "brightness": round(float(quantile_score(brightness)[i]), 4),
                    "contrast": round(float(quantile_score(contrast)[i]), 4),
                    "saliencySpread": round(float(sal_entropy[i]), 4),
                    "centerFocus": round(float(quantile_score(center_focus)[i]), 4),
                    "paletteComplexity": round(float(palette_entropy[i]), 4),
                    "verticality": round(float(quantile_score(edge_vertical - edge_horizontal)[i]), 4),
                    "poseDensity": round(float(pose_density[i]), 4),
                    "xBias": round(float(x_bias[i]), 4),
                    "yBias": round(float(y_bias[i]), 4),
                },
            }
        )

    years = [record["year"] for record in records if record["year"] is not None]
    payload = {
        "generatedFrom": {
            "metadata": str(METADATA_PATH.relative_to(ROOT)),
            "features": str(FEATURE_PATH.relative_to(ROOT)),
            "records": len(records),
        },
        "yearRange": [min(years), max(years)] if years else [None, None],
        "facets": {
            "department": top_facets(records, "department"),
            "type": top_facets(records, "type"),
            "culture": top_facets(records, "culture"),
            "collection": top_facets(records, "collection"),
        },
        "records": records,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT_PATH} with {len(records):,} records")


if __name__ == "__main__":
    main()
