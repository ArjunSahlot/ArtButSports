#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.features import (  # noqa: E402
    EMBED_MODEL,
    POSE_ANGLE_TRIPLES,
    configure_inference_device,
    embed_image_bytes,
    extract_color,
    extract_composition,
    extract_pose,
    inference_device_info,
    read_image_path,
)
from backend.scoring import DEFAULT_WEIGHTS, FeatureStore, load_feature_store, score_query  # noqa: E402

FEATURE_CACHE_VERSION = 1
DEFAULT_HIT_K = (1, 5, 10, 30, 100)
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
SCORE_KEYS = (
    "total",
    "embeddings",
    "composition",
    "color",
    "pose",
    "saliency",
    "edges",
    "lab",
    "palette",
    "warmcool",
    "contrast",
)


@dataclass(frozen=True)
class TargetSpec:
    id: str
    path: Path


@dataclass(frozen=True)
class CaseSpec:
    id: str
    input_path: Path
    targets: tuple[TargetSpec, ...]


@dataclass(frozen=True)
class ImageFeatures:
    path: Path
    embedding: np.ndarray
    saliency: np.ndarray
    edges: np.ndarray
    lab: np.ndarray
    palette: np.ndarray
    warmcool: np.ndarray
    contrast: np.ndarray
    has_pose: bool
    pose: np.ndarray

    def as_query(self) -> dict[str, Any]:
        return {
            "embedding": self.embedding,
            "composition": {
                "saliency": self.saliency,
                "edges": self.edges,
            },
            "color": {
                "lab": self.lab,
                "palette": self.palette,
                "warmcool": self.warmcool,
                "contrast": self.contrast,
            },
            "pose": {
                "has_pose": self.has_pose,
                "pose": self.pose,
            },
        }


@dataclass(frozen=True)
class CandidateRow:
    id: str
    label: str
    case_id: str
    features: ImageFeatures

    def metadata(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.label,
            "creators": "benchmark target",
            "accession_number": self.id,
            "benchmark_case_id": self.case_id,
            "benchmark_path": str(self.features.path),
            "benchmark_target": True,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate ArtButSports ranking quality on local input/target image folders.")
    parser.add_argument(
        "cases_dir",
        help="Folder containing one subfolder per benchmark case. Each case folder needs input.<ext>; all other images are targets.",
    )
    parser.add_argument("--feature-table", default="data/features/artbutsports_features.npz")
    parser.add_argument("--weights", default=None, help="Optional JSON weights file. Defaults to backend DEFAULT_WEIGHTS.")
    parser.add_argument("--output", default=None, help="Output report JSON. Defaults to benchmark/runs/<cases_dir>-<timestamp>.json.")
    parser.add_argument("--cache-dir", default="benchmark/.cache/features")
    parser.add_argument("--refresh-cache", action="store_true", help="Recompute input/target image features.")
    parser.add_argument("--hit-k", nargs="+", type=int, default=list(DEFAULT_HIT_K), help="Cutoffs for hit/recall/nDCG.")
    parser.add_argument("--top-n", type=int, default=10, help="Top ranked items to include per case.")
    parser.add_argument("--case-id", action="append", default=None, help="Run only matching case id. May be repeated.")
    parser.add_argument("--device", default=None, help="Inference device override: cpu, cuda, cuda:0, or auto.")
    parser.add_argument(
        "--skip-embeddings",
        action="store_true",
        help="Use zero Gemini embeddings for smoke tests only. This is not a real benchmark run.",
    )
    return parser.parse_args()


def resolve_repo_path(raw: str | Path) -> Path:
    path = Path(raw).expanduser()
    if path.is_absolute():
        return path
    return (ROOT / path).resolve()


def sanitize_id(value: str) -> str:
    clean = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in value.strip())
    return clean.strip("_") or "case"


def is_image_path(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS


def find_input_image(case_dir: Path) -> Path:
    matches = sorted(path for path in case_dir.iterdir() if is_image_path(path) and path.stem.lower() == "input")
    if not matches:
        allowed = ", ".join(f"input{ext}" for ext in sorted(IMAGE_EXTENSIONS))
        raise FileNotFoundError(f"Case {case_dir.name!r} is missing an input image. Expected one of: {allowed}")
    if len(matches) > 1:
        formatted = ", ".join(path.name for path in matches)
        raise ValueError(f"Case {case_dir.name!r} has multiple input images: {formatted}")
    return matches[0]


def load_cases(cases_dir: Path) -> list[CaseSpec]:
    if not cases_dir.exists() or not cases_dir.is_dir():
        raise NotADirectoryError(f"Cases path must be a directory: {cases_dir}")

    cases: list[CaseSpec] = []
    for case_dir in sorted(path for path in cases_dir.iterdir() if path.is_dir()):
        input_path = find_input_image(case_dir)
        target_paths = sorted(path for path in case_dir.iterdir() if is_image_path(path) and path != input_path)
        if not target_paths:
            raise FileNotFoundError(f"Case {case_dir.name!r} has no target images next to {input_path.name}.")
        targets = tuple(TargetSpec(id=sanitize_id(path.stem), path=path.resolve()) for path in target_paths)
        cases.append(CaseSpec(id=sanitize_id(case_dir.name), input_path=input_path.resolve(), targets=targets))
    return cases


def validate_cases(cases: list[CaseSpec]) -> None:
    seen: set[str] = set()
    for case in cases:
        if case.id in seen:
            raise ValueError(f"Duplicate case id: {case.id}")
        seen.add(case.id)
        missing = [case.input_path, *(target.path for target in case.targets)]
        missing = [path for path in missing if not path.exists()]
        if missing:
            formatted = "\n".join(f"  - {path}" for path in missing)
            raise FileNotFoundError(f"Missing image file(s) for case {case.id}:\n{formatted}")


def guess_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    if mime and mime.startswith("image/"):
        return mime
    return "image/png" if path.suffix.lower() == ".png" else "image/jpeg"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def cache_path_for(path: Path, cache_dir: Path, skip_embeddings: bool) -> Path:
    source_hash = sha256_file(path)
    embedding_key = "zero-embedding" if skip_embeddings else EMBED_MODEL
    raw_key = f"v{FEATURE_CACHE_VERSION}:{embedding_key}:{source_hash}"
    cache_key = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    return cache_dir / f"{cache_key}.npz"


def pose_array(pose: dict[str, Any]) -> np.ndarray:
    out = np.zeros((4, len(POSE_ANGLE_TRIPLES)), dtype=np.float32) - 1.0
    for index, desc in enumerate(np.asarray(pose.get("pose", []), dtype=np.float32)[:4]):
        out[index, : len(desc)] = desc
    return out


def load_cached_features(path: Path, cache_path: Path) -> ImageFeatures:
    with np.load(cache_path, allow_pickle=False) as data:
        return ImageFeatures(
            path=path,
            embedding=data["embedding"].astype(np.float32),
            saliency=data["saliency"].astype(np.float32),
            edges=data["edges"].astype(np.float32),
            lab=data["lab"].astype(np.float32),
            palette=data["palette"].astype(np.float32),
            warmcool=data["warmcool"].astype(np.float32),
            contrast=data["contrast"].astype(np.float32),
            has_pose=bool(data["has_pose"].item()),
            pose=data["pose"].astype(np.float32),
        )


def save_cached_features(cache_path: Path, features: ImageFeatures) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = cache_path.with_name(cache_path.name + ".tmp.npz")
    np.savez_compressed(
        tmp_path,
        embedding=features.embedding.astype(np.float32),
        saliency=features.saliency.astype(np.float32),
        edges=features.edges.astype(np.float32),
        lab=features.lab.astype(np.float32),
        palette=features.palette.astype(np.float32),
        warmcool=features.warmcool.astype(np.float32),
        contrast=features.contrast.astype(np.float32),
        has_pose=np.asarray(features.has_pose, dtype=bool),
        pose=features.pose.astype(np.float32),
    )
    tmp_path.replace(cache_path)


def extract_image_features(path: Path, cache_dir: Path, refresh_cache: bool, skip_embeddings: bool) -> ImageFeatures:
    path = path.resolve()
    cache_path = cache_path_for(path, cache_dir, skip_embeddings)
    if cache_path.exists() and not refresh_cache:
        return load_cached_features(path, cache_path)

    image = read_image_path(path)
    composition = extract_composition(image)
    color = extract_color(image)
    pose = extract_pose(image)
    embedding = np.zeros(3072, dtype=np.float32) if skip_embeddings else embed_image_bytes(path.read_bytes(), guess_mime(path))

    features = ImageFeatures(
        path=path,
        embedding=embedding.astype(np.float32),
        saliency=composition["saliency"].astype(np.float32),
        edges=composition["edges"].astype(np.float32),
        lab=color["lab"].astype(np.float32),
        palette=color["palette"].astype(np.float32),
        warmcool=color["warmcool"].astype(np.float32),
        contrast=color["contrast"].astype(np.float32),
        has_pose=bool(pose["has_pose"]),
        pose=pose_array(pose),
    )
    save_cached_features(cache_path, features)
    return features


def append_candidates(store: FeatureStore, candidates: list[CandidateRow]) -> FeatureStore:
    if not candidates:
        return store

    return FeatureStore(
        ids=np.concatenate([store.ids.astype(str), np.asarray([candidate.id for candidate in candidates])]),
        metadata=[*store.metadata, *(candidate.metadata() for candidate in candidates)],
        embeddings=np.vstack([store.embeddings, *[candidate.features.embedding for candidate in candidates]]).astype(np.float32),
        saliency=np.vstack([store.saliency, *[candidate.features.saliency for candidate in candidates]]).astype(np.float32),
        edges=np.vstack([store.edges, *[candidate.features.edges for candidate in candidates]]).astype(np.float32),
        lab=np.vstack([store.lab, *[candidate.features.lab for candidate in candidates]]).astype(np.float32),
        palette=np.vstack([store.palette, *[candidate.features.palette for candidate in candidates]]).astype(np.float32),
        warmcool=np.vstack([store.warmcool, *[candidate.features.warmcool for candidate in candidates]]).astype(np.float32),
        contrast=np.vstack([store.contrast, *[candidate.features.contrast for candidate in candidates]]).astype(np.float32),
        has_pose=np.concatenate([store.has_pose, np.asarray([candidate.features.has_pose for candidate in candidates], dtype=bool)]),
        pose=np.concatenate([store.pose, np.asarray([candidate.features.pose for candidate in candidates], dtype=np.float32)]),
        calibration=store.calibration,
    )


def score_breakdown(scores: dict[str, np.ndarray], index: int) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for key in SCORE_KEYS:
        if key == "pose" and not bool(scores["pose_valid"][index]):
            out[key] = None
        else:
            out[key] = float(scores[key][index])
    return out


def ranked_item(store: FeatureStore, scores: dict[str, np.ndarray], index: int, rank: int, corpus_count: int) -> dict[str, Any]:
    metadata = dict(store.metadata[index])
    item_id = str(store.ids[index])
    return {
        "rank": rank,
        "id": item_id,
        "source": "benchmark_target" if index >= corpus_count else "corpus",
        "title": metadata.get("title"),
        "creators": metadata.get("creators"),
        "path": metadata.get("benchmark_path"),
        "image_web": metadata.get("image_web"),
        "scores": score_breakdown(scores, index),
    }


def average_precision(ranks: list[int]) -> float:
    ordered = sorted(ranks)
    return float(sum((index + 1) / rank for index, rank in enumerate(ordered)) / len(ordered))


def ndcg_at_k(ranks: list[int], k: int) -> float:
    dcg = sum(1.0 / np.log2(rank + 1) for rank in ranks if rank <= k)
    ideal_count = min(len(ranks), k)
    if ideal_count == 0:
        return 0.0
    idcg = sum(1.0 / np.log2(rank + 1) for rank in range(1, ideal_count + 1))
    return float(dcg / idcg) if idcg > 0 else 0.0


def evaluate_case(
    case: CaseSpec,
    store: FeatureStore,
    weights: dict[str, Any] | None,
    hit_k: list[int],
    top_n: int,
    cache_dir: Path,
    refresh_cache: bool,
    skip_embeddings: bool,
) -> dict[str, Any]:
    input_features = extract_image_features(case.input_path, cache_dir, refresh_cache, skip_embeddings)
    candidates = []
    for target_index, target in enumerate(case.targets, start=1):
        candidates.append(
            CandidateRow(
                id=f"benchmark::{case.id}::{target_index}::{target.id}",
                label=target.id,
                case_id=case.id,
                features=extract_image_features(target.path, cache_dir, refresh_cache, skip_embeddings),
            )
        )

    corpus_count = len(store.ids)
    augmented_store = append_candidates(store, candidates)
    scores = score_query(augmented_store, input_features.as_query(), weights)
    order = scores["total"].argsort()[::-1]
    ranks = np.empty(len(order), dtype=np.int64)
    ranks[order] = np.arange(1, len(order) + 1)
    target_indices = list(range(corpus_count, corpus_count + len(candidates)))
    target_ranks = [int(ranks[index]) for index in target_indices]
    best_rank = min(target_ranks)
    total_ranked = len(order)

    target_items = [
        ranked_item(augmented_store, scores, index, int(ranks[index]), corpus_count)
        for index in target_indices
    ]
    target_items.sort(key=lambda item: item["rank"])

    top_items = [
        ranked_item(augmented_store, scores, int(index), rank, corpus_count)
        for rank, index in enumerate(order[: max(0, top_n)], start=1)
    ]

    metrics: dict[str, Any] = {
        "best_rank": best_rank,
        "mean_target_rank": float(np.mean(target_ranks)),
        "median_target_rank": float(np.median(target_ranks)),
        "reciprocal_rank": float(1.0 / best_rank),
        "average_precision": average_precision(target_ranks),
        "best_rank_percentile": float(1.0 - ((best_rank - 1) / max(1, total_ranked - 1))),
    }
    for k in hit_k:
        metrics[f"hit@{k}"] = bool(any(rank <= k for rank in target_ranks))
        metrics[f"recall@{k}"] = float(sum(rank <= k for rank in target_ranks) / len(target_ranks))
        metrics[f"ndcg@{k}"] = ndcg_at_k(target_ranks, k)

    return {
        "id": case.id,
        "input": str(case.input_path),
        "target_count": len(candidates),
        "total_ranked": total_ranked,
        "metrics": metrics,
        "targets": target_items,
        "top": top_items,
    }


def summarize(case_results: list[dict[str, Any]], hit_k: list[int]) -> dict[str, Any]:
    if not case_results:
        raise ValueError("No benchmark cases were evaluated.")

    metrics = [case["metrics"] for case in case_results]
    summary: dict[str, Any] = {
        "case_count": len(case_results),
        "target_count": int(sum(case["target_count"] for case in case_results)),
        "score": float(np.mean([metric["reciprocal_rank"] for metric in metrics])),
        "score_name": "mean_reciprocal_rank",
        "mean_best_rank": float(np.mean([metric["best_rank"] for metric in metrics])),
        "median_best_rank": float(np.median([metric["best_rank"] for metric in metrics])),
        "mean_target_rank": float(np.mean([metric["mean_target_rank"] for metric in metrics])),
        "mean_average_precision": float(np.mean([metric["average_precision"] for metric in metrics])),
        "mean_best_rank_percentile": float(np.mean([metric["best_rank_percentile"] for metric in metrics])),
    }
    for k in hit_k:
        summary[f"hit@{k}"] = float(np.mean([1.0 if metric[f"hit@{k}"] else 0.0 for metric in metrics]))
        summary[f"recall@{k}"] = float(np.mean([metric[f"recall@{k}"] for metric in metrics]))
        summary[f"ndcg@{k}"] = float(np.mean([metric[f"ndcg@{k}"] for metric in metrics]))
    return summary


def default_output_path(cases_dir: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return ROOT / "benchmark" / "runs" / f"{cases_dir.name}-{stamp}.json"


def load_weights(path: str | None) -> dict[str, Any] | None:
    if not path:
        return None
    return json.loads(resolve_repo_path(path).read_text(encoding="utf-8"))


def print_report(report: dict[str, Any], output_path: Path) -> None:
    summary = report["summary"]
    hit_key = "hit@10" if "hit@10" in summary else next((key for key in summary if key.startswith("hit@")), None)
    hit_label = hit_key or "hit@k"
    hit_value = summary.get(hit_key, 0.0) if hit_key else 0.0
    print(f"Benchmark score ({summary['score_name']}): {summary['score']:.4f}")
    print(
        "Cases: {case_count} | Targets: {target_count} | "
        "Mean best rank: {mean_best_rank:.2f} | {hit_label}: {hit_value:.2%}".format(
            case_count=summary["case_count"],
            target_count=summary["target_count"],
            mean_best_rank=summary["mean_best_rank"],
            hit_label=hit_label,
            hit_value=hit_value,
        )
    )
    print(f"Report: {output_path}")
    print()
    print("Per-case best ranks:")
    for case in report["cases"]:
        best = case["metrics"]["best_rank"]
        rr = case["metrics"]["reciprocal_rank"]
        print(f"  {case['id']}: rank {best} (RR {rr:.4f})")


def main() -> None:
    args = parse_args()
    load_dotenv(ROOT / ".env")
    configure_inference_device(args.device)

    cases_dir = resolve_repo_path(args.cases_dir)
    cases = load_cases(cases_dir)
    if args.case_id:
        allowed = set(args.case_id)
        cases = [case for case in cases if case.id in allowed]
    if not cases:
        raise SystemExit("No benchmark cases matched the requested folder/filter.")
    validate_cases(cases)

    hit_k = sorted(set(k for k in args.hit_k if k > 0))
    if not hit_k:
        raise SystemExit("--hit-k must include at least one positive integer.")
    feature_table_path = resolve_repo_path(args.feature_table)
    cache_dir = resolve_repo_path(args.cache_dir)
    weights = load_weights(args.weights)
    store = load_feature_store(str(feature_table_path))

    case_results = [
        evaluate_case(
            case=case,
            store=store,
            weights=weights,
            hit_k=hit_k,
            top_n=args.top_n,
            cache_dir=cache_dir,
            refresh_cache=args.refresh_cache,
            skip_embeddings=args.skip_embeddings,
        )
        for case in cases
    ]

    output_path = resolve_repo_path(args.output) if args.output else default_output_path(cases_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "feature_table": str(feature_table_path),
        "corpus_count": int(len(store.ids)),
        "weights": weights if weights is not None else DEFAULT_WEIGHTS,
        "embedding_mode": "zero-smoke-test" if args.skip_embeddings else EMBED_MODEL,
        "inference": inference_device_info(),
        "cases_dir": str(cases_dir),
        "summary": summarize(case_results, hit_k),
        "cases": case_results,
    }
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print_report(report, output_path)


if __name__ == "__main__":
    main()
