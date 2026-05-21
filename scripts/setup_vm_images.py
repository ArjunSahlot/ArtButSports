#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

import pandas as pd
from tqdm import tqdm


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download corpus images and build backend id-to-path manifest.")
    parser.add_argument("--metadata", default="data/img-metadata-CC0-clean.csv")
    parser.add_argument("--image-dir", default="data/vm_images/images")
    parser.add_argument("--manifest", default="data/vm_images/manifest.json")
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


def local_path(image_dir: Path, row: pd.Series) -> Path:
    acc = str(row["accession_number"]).replace("/", "_")
    return image_dir / f"{row['id']}_{acc}.jpg"


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
        path.unlink(missing_ok=True)
        return False


def main() -> None:
    args = parse_args()
    df = pd.read_csv(args.metadata, low_memory=False).dropna(subset=["image_web"]).reset_index(drop=True)
    if args.limit:
        df = df.head(args.limit).reset_index(drop=True)
    image_dir = Path(args.image_dir)
    manifest_path = Path(args.manifest)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}
    missing: list[str] = []
    total_size = 0
    for _, row in tqdm(df.iterrows(), total=len(df), desc="vm images"):
        path = local_path(image_dir, row)
        if download(str(row["image_web"]), path):
            manifest[str(row["id"])] = str(path.resolve())
            total_size += path.stat().st_size
        else:
            missing.append(str(row["id"]))
    manifest_path.write_text(json.dumps(manifest, indent=2))
    report = {
        "manifest": str(manifest_path),
        "count": len(manifest),
        "missing_count": len(missing),
        "missing_ids": missing[:100],
        "total_size_gb": round(total_size / (1024**3), 3),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

