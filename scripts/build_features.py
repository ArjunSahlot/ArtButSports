#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from tqdm import tqdm

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from artbutsports.features import (  # noqa: E402
    EDGE_BINS,
    POSE_ANGLE_TRIPLES,
    SALIENCY_GRID,
    embed_image_path,
    extract_color,
    extract_composition,
    extract_pose,
    read_image_path,
)
from artbutsports.scoring import calibration_from_arrays, normalize_rows  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build ArtButSports corpus feature table.")
    parser.add_argument("--metadata", default="data/img-metadata-CC0-clean.csv")
    parser.add_argument("--cache-dir", default="data/cache/images")
    parser.add_argument("--output", default="data/features/artbutsports_features.npz")
    parser.add_argument("--failures", default="data/features/failures.csv")
    parser.add_argument("--limit", type=int, default=None, help="Build only the first N rows for local verification.")
    parser.add_argument("--sample", type=int, default=None, help="Randomly sample N rows for local verification.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--skip-embeddings", action="store_true", help="Use zero embeddings; only for debugging feature code.")
    return parser.parse_args()


def image_path(cache_dir: Path, row: pd.Series) -> Path:
    acc = str(row["accession_number"]).replace("/", "_")
    return cache_dir / f"{row['id']}_{acc}.jpg"


def download(url: str, path: Path) -> bool:
    if path.exists() and path.stat().st_size > 0:
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ArtButSports/1.0"})
        with urllib.request.urlopen(req, timeout=90) as response:
            path.write_bytes(response.read())
        return path.stat().st_size > 0
    except Exception:
        if path.exists():
            path.unlink(missing_ok=True)
        return False


def pairwise_sample_calibration(blocks: dict[str, np.ndarray], sample_size: int = 512, seed: int = 42) -> dict[str, dict[str, float]]:
    rng = np.random.default_rng(seed)
    arrays: dict[str, np.ndarray] = {}
    for name, mat in blocks.items():
        mat = normalize_rows(mat.astype(np.float32))
        n = len(mat)
        if n < 2:
            arrays[name] = np.asarray([0.0, 1.0], dtype=np.float32)
            continue
        left = rng.integers(0, n, size=min(sample_size, n * max(1, n - 1)))
        right = rng.integers(0, n, size=len(left))
        keep = left != right
        arrays[name] = np.sum(mat[left[keep]] * mat[right[keep]], axis=1)
    return calibration_from_arrays(arrays)


def main() -> None:
    load_dotenv()
    args = parse_args()
    metadata = pd.read_csv(args.metadata, low_memory=False).dropna(subset=["image_web"]).reset_index(drop=True)
    if args.sample:
        metadata = metadata.sample(args.sample, random_state=args.seed).reset_index(drop=True)
    if args.limit:
        metadata = metadata.head(args.limit).reset_index(drop=True)

    cache_dir = Path(args.cache_dir)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    failures: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    ids: list[str] = []
    embeddings: list[np.ndarray] = []
    saliency: list[np.ndarray] = []
    edges: list[np.ndarray] = []
    lab: list[np.ndarray] = []
    palette: list[np.ndarray] = []
    warmcool: list[np.ndarray] = []
    contrast: list[np.ndarray] = []
    has_pose: list[bool] = []
    poses: list[np.ndarray] = []

    for _, row in tqdm(metadata.iterrows(), total=len(metadata), desc="features"):
        art_id = str(row["id"])
        path = image_path(cache_dir, row)
        if not download(str(row["image_web"]), path):
            failures.append({"id": art_id, "stage": "download", "error": "download failed"})
            continue
        try:
            image = read_image_path(path)
            color = extract_color(image)
            comp = extract_composition(image)
            pose = extract_pose(image)
            if args.skip_embeddings:
                embedding = np.zeros(3072, dtype=np.float32)
            else:
                embedding = embed_image_path(path)
            ids.append(art_id)
            rows.append(
                {
                    "id": art_id,
                    "accession_number": row.get("accession_number"),
                    "title": row.get("title"),
                    "creators": row.get("creators"),
                    "image_web": row.get("image_web"),
                    "url": row.get("url"),
                }
            )
            embeddings.append(embedding)
            saliency.append(comp["saliency"])
            edges.append(comp["edges"])
            lab.append(color["lab"])
            palette.append(color["palette"])
            warmcool.append(color["warmcool"])
            contrast.append(color["contrast"])
            has_pose.append(bool(pose["has_pose"]))
            pose_arr = np.zeros((4, len(POSE_ANGLE_TRIPLES)), dtype=np.float32) - 1.0
            for i, desc in enumerate(pose["pose"][:4]):
                pose_arr[i, : len(desc)] = desc
            poses.append(pose_arr)
        except Exception as exc:
            failures.append({"id": art_id, "stage": "features", "error": repr(exc)})

    failure_path = Path(args.failures)
    failure_path.parent.mkdir(parents=True, exist_ok=True)
    if not ids:
        with failure_path.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["id", "stage", "error"])
            writer.writeheader()
            writer.writerows(failures)
        raise SystemExit(f"No feature rows were built. See {failure_path}.")

    arrays = {
        "embeddings": np.vstack(embeddings).astype(np.float32),
        "saliency": np.vstack(saliency).astype(np.float32),
        "edges": np.vstack(edges).astype(np.float32),
        "lab": np.vstack(lab).astype(np.float32),
        "palette": np.vstack(palette).astype(np.float32),
        "warmcool": np.vstack(warmcool).astype(np.float32),
        "contrast": np.vstack(contrast).astype(np.float32),
    }
    calibration = pairwise_sample_calibration(arrays, seed=args.seed)
    calibration["pose"] = {"p05": 0.35, "p95": 0.95}
    np.savez_compressed(
        out_path,
        ids=np.asarray(ids),
        metadata=np.asarray(rows, dtype=object),
        has_pose=np.asarray(has_pose, dtype=bool),
        pose=np.asarray(poses, dtype=np.float32),
        calibration=np.asarray(calibration, dtype=object),
        **arrays,
    )
    with failure_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "stage", "error"])
        writer.writeheader()
        writer.writerows(failures)
    print(json.dumps({"output": str(out_path), "rows": len(ids), "failures": len(failures)}, indent=2))


if __name__ == "__main__":
    main()
