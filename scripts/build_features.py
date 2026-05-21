#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from tqdm import tqdm

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from artbutsports.features import (  # noqa: E402
    POSE_ANGLE_TRIPLES,
    configure_inference_device,
    embed_image_path,
    extract_color,
    extract_composition,
    extract_pose,
    inference_device_info,
    read_image_path,
    warmup_inference_models,
)
from artbutsports.scoring import calibration_from_arrays, normalize_rows  # noqa: E402

MANIFEST_VERSION = 2
ARRAY_KEYS = ("embeddings", "saliency", "edges", "lab", "palette", "warmcool", "contrast")
REQUIRED_GROUPS = ("embedding", "composition", "color", "pose")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build ArtButSports corpus feature table.")
    parser.add_argument("--metadata", default="data/img-metadata-CC0-clean.csv")
    parser.add_argument("--cache-dir", default="data/cache/images")
    parser.add_argument("--output", default="data/features/artbutsports_features.npz")
    parser.add_argument("--failures", default="data/features/failures.csv")
    parser.add_argument(
        "--checkpoint-dir",
        default=None,
        help="Directory for resume shards (default: <output_stem>_checkpoint next to --output).",
    )
    parser.add_argument(
        "--checkpoint-every",
        type=int,
        default=25,
        help="Flush manifest/failure summaries after this many processed rows.",
    )
    parser.add_argument("--download-workers", type=int, default=16, help="Concurrent image download workers.")
    parser.add_argument("--embedding-workers", type=int, default=8, help="Concurrent Gemini embedding workers.")
    parser.add_argument("--fresh", action="store_true", help="Ignore/delete existing checkpoint and start over.")
    parser.add_argument("--keep-checkpoint", action="store_true", help="Keep checkpoint shards after a successful build.")
    parser.add_argument("--limit", type=int, default=None, help="Build only the first N rows for local verification.")
    parser.add_argument("--sample", type=int, default=None, help="Randomly sample N rows for local verification.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--skip-embeddings", action="store_true", help="Use zero embeddings; only for debugging feature code.")
    parser.add_argument(
        "--device",
        default=None,
        help="Override inference device (default: cpu). Set ARTBUTSPORTS_DEVICE=cuda in .env for GPU.",
    )
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


def path_ready(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 0


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


def checkpoint_dir_for(output: Path, explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    return output.parent / f"{output.stem}_checkpoint"


def manifest_path(checkpoint_dir: Path) -> Path:
    return checkpoint_dir / "manifest.json"


def records_dir(checkpoint_dir: Path) -> Path:
    return checkpoint_dir / "records"


def record_path(checkpoint_dir: Path, art_id: str) -> Path:
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in str(art_id))
    return records_dir(checkpoint_dir) / f"{safe}.npz"


def atomic_replace(src: Path, dst: Path) -> None:
    os.replace(src, dst)


def savez_atomic(path: Path, **arrays: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp.npz")
    np.savez_compressed(tmp, **arrays)
    atomic_replace(tmp, path)


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    atomic_replace(tmp, path)


def build_config(args: argparse.Namespace, metadata_rows: int) -> dict[str, Any]:
    return {
        "version": MANIFEST_VERSION,
        "metadata": str(args.metadata),
        "metadata_rows": metadata_rows,
        "sample": args.sample,
        "limit": args.limit,
        "seed": args.seed,
        "skip_embeddings": bool(args.skip_embeddings),
    }


def assert_config_matches(manifest: dict[str, Any], expected: dict[str, Any]) -> None:
    for key in ("version", "metadata", "metadata_rows", "sample", "limit", "seed", "skip_embeddings"):
        if manifest.get(key) != expected.get(key):
            raise SystemExit(
                f"Checkpoint config mismatch on {key!r}: "
                f"checkpoint={manifest.get(key)!r} current={expected.get(key)!r}. "
                "Use --fresh to discard the checkpoint and restart."
            )


def metadata_payload(row: pd.Series, art_id: str) -> dict[str, Any]:
    return {
        "id": art_id,
        "accession_number": row.get("accession_number"),
        "title": row.get("title"),
        "creators": row.get("creators"),
        "image_web": row.get("image_web"),
        "url": row.get("url"),
    }


def empty_record(row: pd.Series, art_id: str) -> dict[str, Any]:
    return {
        "id": art_id,
        "metadata": metadata_payload(row, art_id),
        "completed": {group: False for group in REQUIRED_GROUPS},
        "errors": [],
    }


def load_record(checkpoint_dir: Path, row: pd.Series, art_id: str) -> dict[str, Any]:
    path = record_path(checkpoint_dir, art_id)
    if not path.exists():
        return empty_record(row, art_id)
    with np.load(path, allow_pickle=True) as data:
        record = {
            "id": str(data["id"].item()),
            "metadata": data["metadata"].item(),
            "completed": data["completed"].item(),
            "errors": list(data["errors"].tolist()) if "errors" in data else [],
        }
        for key in ARRAY_KEYS:
            if key in data:
                record[key] = data[key]
        if "has_pose" in data:
            record["has_pose"] = bool(data["has_pose"].item())
        if "pose" in data:
            record["pose"] = data["pose"]
    for group in REQUIRED_GROUPS:
        record["completed"].setdefault(group, False)
    record["metadata"] = metadata_payload(row, art_id)
    return record


def pose_array(pose: dict[str, Any]) -> np.ndarray:
    pose_arr = np.zeros((4, len(POSE_ANGLE_TRIPLES)), dtype=np.float32) - 1.0
    for i, desc in enumerate(pose["pose"][:4]):
        pose_arr[i, : len(desc)] = desc
    return pose_arr


def is_record_complete(record: dict[str, Any]) -> bool:
    return all(record.get("completed", {}).get(group, False) for group in REQUIRED_GROUPS)


def write_record(checkpoint_dir: Path, record: dict[str, Any]) -> None:
    arrays: dict[str, np.ndarray] = {
        "id": np.asarray(record["id"]),
        "metadata": np.asarray(record["metadata"], dtype=object),
        "completed": np.asarray(record["completed"], dtype=object),
        "errors": np.asarray(record.get("errors", []), dtype=object),
    }
    for key in ARRAY_KEYS:
        if key in record:
            arrays[key] = np.asarray(record[key], dtype=np.float32)
    if "has_pose" in record:
        arrays["has_pose"] = np.asarray(record["has_pose"], dtype=bool)
    if "pose" in record:
        arrays["pose"] = np.asarray(record["pose"], dtype=np.float32)
    savez_atomic(record_path(checkpoint_dir, record["id"]), **arrays)


def record_paths(checkpoint_dir: Path) -> list[Path]:
    return sorted(records_dir(checkpoint_dir).glob("*.npz"))


def summarize_records(checkpoint_dir: Path) -> dict[str, Any]:
    complete = 0
    incomplete = 0
    missing_by_group = {group: 0 for group in REQUIRED_GROUPS}
    for path in record_paths(checkpoint_dir):
        with np.load(path, allow_pickle=True) as data:
            completed = data["completed"].item()
        if all(completed.get(group, False) for group in REQUIRED_GROUPS):
            complete += 1
        else:
            incomplete += 1
            for group in REQUIRED_GROUPS:
                if not completed.get(group, False):
                    missing_by_group[group] += 1
    return {"complete": complete, "incomplete": incomplete, "missing_by_group": missing_by_group}


def load_manifest_state(checkpoint_dir: Path) -> tuple[dict[str, Any] | None, list[dict[str, Any]], dict[str, Any]]:
    summary = summarize_records(checkpoint_dir)
    path = manifest_path(checkpoint_dir)
    if not path.exists():
        if summary["complete"] or summary["incomplete"]:
            raise SystemExit(
                f"Checkpoint records exist in {checkpoint_dir} but manifest.json is missing. "
                "Restore manifest.json or use --fresh after backing up records."
            )
        return None, [], summary
    manifest = json.loads(path.read_text(encoding="utf-8"))
    failures = list(manifest.get("failures", []))
    return manifest, failures, summary


def merge_complete_records(checkpoint_dir: Path) -> dict[str, list[Any]]:
    merged: dict[str, list[Any]] = {
        "ids": [],
        "rows": [],
        "embeddings": [],
        "saliency": [],
        "edges": [],
        "lab": [],
        "palette": [],
        "warmcool": [],
        "contrast": [],
        "has_pose": [],
        "poses": [],
    }
    for path in record_paths(checkpoint_dir):
        with np.load(path, allow_pickle=True) as data:
            completed = data["completed"].item()
            if not all(completed.get(group, False) for group in REQUIRED_GROUPS):
                continue
            merged["ids"].append(str(data["id"].item()))
            merged["rows"].append(data["metadata"].item())
            merged["has_pose"].append(bool(data["has_pose"].item()))
            merged["poses"].append(data["pose"])
            for key in ARRAY_KEYS:
                merged[key].append(data[key])
    return merged


def merged_to_arrays(merged: dict[str, Any]) -> dict[str, np.ndarray]:
    arrays = {key: np.vstack(merged[key]).astype(np.float32) for key in ARRAY_KEYS}
    return {
        "ids": np.asarray(merged["ids"]),
        "metadata": np.asarray(merged["rows"], dtype=object),
        "has_pose": np.asarray(merged["has_pose"], dtype=bool),
        "pose": np.asarray(merged["poses"], dtype=np.float32),
        **arrays,
    }


def clear_checkpoint(checkpoint_dir: Path) -> None:
    if not checkpoint_dir.exists():
        return
    for path in sorted(checkpoint_dir.rglob("*"), reverse=True):
        if path.is_file():
            path.unlink()
        elif path.is_dir():
            path.rmdir()


def write_failures(path: Path, failures: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "stage", "error"])
        writer.writeheader()
        writer.writerows(failures)


def record_failure(record: dict[str, Any], failures: list[dict[str, Any]], stage: str, error: str) -> None:
    failure = {"id": record["id"], "stage": stage, "error": error}
    failures.append(failure)
    record.setdefault("errors", []).append(failure)


def compute_missing_features(
    *,
    record: dict[str, Any],
    row: pd.Series,
    image: np.ndarray,
    image_file: Path,
    skip_embeddings: bool,
    failures: list[dict[str, Any]],
    include_embedding: bool,
) -> bool:
    changed = False
    completed = record["completed"]

    if not completed.get("color", False):
        try:
            color = extract_color(image)
            record["lab"] = color["lab"]
            record["palette"] = color["palette"]
            record["warmcool"] = color["warmcool"]
            record["contrast"] = color["contrast"]
            completed["color"] = True
            changed = True
        except Exception as exc:
            record_failure(record, failures, "color", repr(exc))
            changed = True

    if not completed.get("composition", False):
        try:
            comp = extract_composition(image)
            record["saliency"] = comp["saliency"]
            record["edges"] = comp["edges"]
            completed["composition"] = True
            changed = True
        except Exception as exc:
            record_failure(record, failures, "composition", repr(exc))
            changed = True

    if not completed.get("pose", False):
        try:
            pose = extract_pose(image)
            record["has_pose"] = bool(pose["has_pose"])
            record["pose"] = pose_array(pose)
            completed["pose"] = True
            changed = True
        except Exception as exc:
            record_failure(record, failures, "pose", repr(exc))
            changed = True

    if include_embedding and not completed.get("embedding", False):
        try:
            record["embeddings"] = np.zeros(3072, dtype=np.float32) if skip_embeddings else embed_image_path(image_file)
            completed["embedding"] = True
            changed = True
        except Exception as exc:
            record_failure(record, failures, "embedding", repr(exc))
            changed = True

    return changed


def prefetch_images(
    *,
    rows: list[tuple[int, pd.Series]],
    cache_dir: Path,
    checkpoint_dir: Path,
    failures: list[dict[str, Any]],
    workers: int,
) -> int:
    jobs = []
    for _, row in rows:
        art_id = str(row["id"])
        record = load_record(checkpoint_dir, row, art_id)
        if is_record_complete(record):
            continue
        path = image_path(cache_dir, row)
        if path_ready(path):
            continue
        jobs.append((row, art_id, path, str(row["image_web"])))

    if not jobs:
        return 0

    failed = 0
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(download, url, path): (row, art_id, path) for row, art_id, path, url in jobs}
        for future in tqdm(as_completed(futures), total=len(futures), desc="downloads"):
            row, art_id, path = futures[future]
            ok = False
            try:
                ok = bool(future.result())
            except Exception:
                ok = False
            if ok:
                continue
            failed += 1
            record = load_record(checkpoint_dir, row, art_id)
            record_failure(record, failures, "download", "download failed")
            write_record(checkpoint_dir, record)
    return failed


def _embed_one(path: Path, skip_embeddings: bool) -> np.ndarray:
    if skip_embeddings:
        return np.zeros(3072, dtype=np.float32)
    return embed_image_path(path)


def fill_missing_embeddings(
    *,
    rows: list[tuple[int, pd.Series]],
    cache_dir: Path,
    checkpoint_dir: Path,
    failures: list[dict[str, Any]],
    skip_embeddings: bool,
    workers: int,
    checkpoint_every: int,
    manifest: dict[str, Any],
    failure_path: Path,
) -> None:
    jobs = []
    for _, row in rows:
        art_id = str(row["id"])
        record = load_record(checkpoint_dir, row, art_id)
        if record["completed"].get("embedding", False):
            continue
        path = image_path(cache_dir, row)
        if not path_ready(path):
            continue
        jobs.append((row, art_id, path))

    if not jobs:
        return

    processed = 0
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(_embed_one, path, skip_embeddings): (row, art_id) for row, art_id, path in jobs}
        for future in tqdm(as_completed(futures), total=len(futures), desc="embeddings"):
            row, art_id = futures[future]
            record = load_record(checkpoint_dir, row, art_id)
            try:
                record["embeddings"] = future.result()
                record["completed"]["embedding"] = True
            except Exception as exc:
                record_failure(record, failures, "embedding", repr(exc))
            write_record(checkpoint_dir, record)
            processed += 1
            if processed >= checkpoint_every:
                manifest["failures"] = failures
                manifest["summary"] = summarize_records(checkpoint_dir)
                write_json_atomic(manifest_path(checkpoint_dir), manifest)
                write_failures(failure_path, failures)
                processed = 0

    manifest["failures"] = failures
    manifest["summary"] = summarize_records(checkpoint_dir)
    write_json_atomic(manifest_path(checkpoint_dir), manifest)
    write_failures(failure_path, failures)


def main() -> None:
    load_dotenv()
    args = parse_args()
    try:
        configure_inference_device(args.device)
        warmup_inference_models()
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc
    print(json.dumps({"inference": inference_device_info()}, indent=2), flush=True)

    metadata = pd.read_csv(args.metadata, low_memory=False).dropna(subset=["image_web"]).reset_index(drop=True)
    if args.sample:
        metadata = metadata.sample(args.sample, random_state=args.seed).reset_index(drop=True)
    if args.limit:
        metadata = metadata.head(args.limit).reset_index(drop=True)
    rows = list(metadata.iterrows())

    cache_dir = Path(args.cache_dir)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    checkpoint_dir = checkpoint_dir_for(out_path, args.checkpoint_dir)
    config = build_config(args, len(metadata))

    if args.fresh:
        clear_checkpoint(checkpoint_dir)

    prior_manifest, failures, summary = load_manifest_state(checkpoint_dir)
    did_resume = bool(summary["complete"] or summary["incomplete"])
    if prior_manifest is None:
        manifest = {**config, "failures": failures, "summary": summary}
        write_json_atomic(manifest_path(checkpoint_dir), manifest)
    else:
        assert_config_matches(prior_manifest, config)
        manifest = prior_manifest
        manifest.setdefault("failures", failures)
        failures = list(manifest["failures"])
        if did_resume:
            print(
                json.dumps(
                    {
                        "resume": True,
                        "checkpoint_dir": str(checkpoint_dir),
                        **summary,
                        "failures": len(failures),
                    },
                    indent=2,
                ),
                flush=True,
            )

    failure_path = Path(args.failures)
    processed_since_manifest = 0

    prefetch_images(
        rows=rows,
        cache_dir=cache_dir,
        checkpoint_dir=checkpoint_dir,
        failures=failures,
        workers=args.download_workers,
    )
    manifest["failures"] = failures
    manifest["summary"] = summarize_records(checkpoint_dir)
    write_json_atomic(manifest_path(checkpoint_dir), manifest)
    write_failures(failure_path, failures)

    for _, row in tqdm(rows, total=len(rows), desc="local features"):
        art_id = str(row["id"])
        record = load_record(checkpoint_dir, row, art_id)
        local_complete = record["completed"].get("composition", False) and record["completed"].get("color", False) and record["completed"].get("pose", False)
        if local_complete:
            continue

        path = image_path(cache_dir, row)
        if not path_ready(path):
            record_failure(record, failures, "download", "download failed")
            manifest["failures"] = failures
            write_record(checkpoint_dir, record)
            write_json_atomic(manifest_path(checkpoint_dir), manifest)
            continue

        try:
            image = read_image_path(path)
        except Exception as exc:
            record_failure(record, failures, "read_image", repr(exc))
            manifest["failures"] = failures
            write_record(checkpoint_dir, record)
            write_json_atomic(manifest_path(checkpoint_dir), manifest)
            continue

        compute_missing_features(
            record=record,
            row=row,
            image=image,
            image_file=path,
            skip_embeddings=args.skip_embeddings,
            failures=failures,
            include_embedding=False,
        )
        write_record(checkpoint_dir, record)
        processed_since_manifest += 1

        if processed_since_manifest >= args.checkpoint_every:
            summary = summarize_records(checkpoint_dir)
            manifest["failures"] = failures
            manifest["summary"] = summary
            write_json_atomic(manifest_path(checkpoint_dir), manifest)
            write_failures(failure_path, failures)
            processed_since_manifest = 0

    fill_missing_embeddings(
        rows=rows,
        cache_dir=cache_dir,
        checkpoint_dir=checkpoint_dir,
        failures=failures,
        skip_embeddings=args.skip_embeddings,
        workers=args.embedding_workers,
        checkpoint_every=args.checkpoint_every,
        manifest=manifest,
        failure_path=failure_path,
    )

    summary = summarize_records(checkpoint_dir)
    manifest["failures"] = failures
    manifest["summary"] = summary
    write_json_atomic(manifest_path(checkpoint_dir), manifest)
    write_failures(failure_path, failures)

    merged = merge_complete_records(checkpoint_dir)
    if not merged["ids"]:
        raise SystemExit(f"No complete feature rows were built. Partial records are in {checkpoint_dir}; failures are in {failure_path}.")

    packed = merged_to_arrays(merged)
    arrays = {key: packed[key] for key in ARRAY_KEYS}
    calibration = pairwise_sample_calibration(arrays, seed=args.seed)
    calibration["pose"] = {"p05": 0.35, "p95": 0.95}
    tmp_out = out_path.with_name(out_path.name + ".tmp.npz")
    np.savez_compressed(
        tmp_out,
        ids=packed["ids"],
        metadata=packed["metadata"],
        has_pose=packed["has_pose"],
        pose=packed["pose"],
        calibration=np.asarray(calibration, dtype=object),
        incomplete_summary=np.asarray(summary, dtype=object),
        **arrays,
    )
    atomic_replace(tmp_out, out_path)

    if not args.keep_checkpoint and summary["incomplete"] == 0:
        clear_checkpoint(checkpoint_dir)

    print(
        json.dumps(
            {
                "output": str(out_path),
                "complete_rows": len(packed["ids"]),
                "incomplete_rows": summary["incomplete"],
                "missing_by_group": summary["missing_by_group"],
                "failures": len(failures),
                "checkpoint_dir": str(checkpoint_dir),
                "checkpoint_kept": args.keep_checkpoint or summary["incomplete"] > 0,
                "resumed": did_resume,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
