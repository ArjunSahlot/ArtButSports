from __future__ import annotations

import base64
import math
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from google import genai
from google.genai import types

EMBED_MODEL = "gemini-embedding-2"
IMG_SIZE = 224
SALIENCY_GRID = 16
EDGE_BINS = 12
LAB_BINS = 32
PALETTE_BINS = (4, 4, 4)
POSE_MODEL_PATH = os.getenv("POSE_MODEL_PATH", "yolo26n-pose.pt")


def read_image_bytes(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Uploaded file is not a readable image")
    return img


def read_image_path(path: str | Path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"Could not read image: {path}")
    return img


def encode_png_data_url(image_bgr_or_rgb: np.ndarray, rgb: bool = False) -> str:
    if rgb:
        bgr = cv2.cvtColor(image_bgr_or_rgb, cv2.COLOR_RGB2BGR)
    else:
        bgr = image_bgr_or_rgb
    ok, encoded = cv2.imencode(".png", bgr)
    if not ok:
        raise ValueError("Could not encode visualization")
    return "data:image/png;base64," + base64.b64encode(encoded.tobytes()).decode("ascii")


def l2_normalize(v: np.ndarray) -> np.ndarray:
    v = np.asarray(v, dtype=np.float32)
    return v / (np.linalg.norm(v) + 1e-9)


def _cos_block(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    a = l2_normalize(a)
    return b @ a


def _image_part_from_bytes(image_bytes: bytes, mime_type: str) -> types.Part:
    return types.Part.from_bytes(data=image_bytes, mime_type=mime_type)


def embed_image_bytes(image_bytes: bytes, mime_type: str = "image/jpeg") -> np.ndarray:
    client = genai.Client()
    response = client.models.embed_content(
        model=EMBED_MODEL,
        contents=[_image_part_from_bytes(image_bytes, mime_type)],
    )
    return l2_normalize(np.asarray(response.embeddings[0].values, dtype=np.float32))


async def embed_image_bytes_async(image_bytes: bytes, mime_type: str = "image/jpeg") -> np.ndarray:
    client = genai.Client()
    response = await client.aio.models.embed_content(
        model=EMBED_MODEL,
        contents=[_image_part_from_bytes(image_bytes, mime_type)],
    )
    return l2_normalize(np.asarray(response.embeddings[0].values, dtype=np.float32))


def embed_image_path(path: str | Path) -> np.ndarray:
    p = Path(path)
    mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
    return embed_image_bytes(p.read_bytes(), mime)


def lab_histogram(image_bgr: np.ndarray, bins: int = LAB_BINS) -> np.ndarray:
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    parts = []
    for ch in range(3):
        hist = cv2.calcHist([lab], [ch], None, [bins], [0, 256]).ravel().astype(np.float32)
        parts.append(hist / (hist.sum() + 1e-9))
    return np.concatenate(parts).astype(np.float32)


def palette_histogram(image_bgr: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    hist = cv2.calcHist([lab], [0, 1, 2], None, list(PALETTE_BINS), [0, 256, 0, 256, 0, 256])
    hist = hist.ravel().astype(np.float32)
    return hist / (hist.sum() + 1e-9)


def dominant_palette(image_bgr: np.ndarray, n_colors: int = 5, sample_pixels: int = 10_000) -> list[dict[str, Any]]:
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB).reshape(-1, 3).astype(np.float32)
    if len(rgb) > sample_pixels:
        rng = np.random.default_rng(42)
        rgb = rgb[rng.choice(len(rgb), sample_pixels, replace=False)]
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(rgb, n_colors, None, criteria, 5, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.ravel(), minlength=n_colors)
    total = counts.sum() or 1
    return [
        {"rgb": centers[i].clip(0, 255).astype(int).tolist(), "weight": float(counts[i] / total)}
        for i in np.argsort(counts)[::-1]
    ]


def warm_cool_vector(image_bgr: np.ndarray, sat_threshold: int = 30) -> np.ndarray:
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    hue = hsv[:, :, 0].astype(np.float32)
    sat = hsv[:, :, 1]
    chromatic = hue[sat > sat_threshold]
    if len(chromatic) == 0:
        return np.asarray([0.5, 0.5], dtype=np.float32)
    warm = np.sum((chromatic <= 35) | (chromatic >= 150))
    cool = np.sum((chromatic > 35) & (chromatic < 150))
    total = warm + cool + 1e-9
    return np.asarray([warm / total, cool / total], dtype=np.float32)


def contrast_vector(image_bgr: np.ndarray, bins: int = 10) -> np.ndarray:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    lo, hi = float(gray.min()), float(gray.max())
    out = [gray.mean() / 255.0, gray.std() / 128.0, (hi - lo) / (hi + lo + 1e-6)]
    edges = np.linspace(0, 256, bins + 1)
    for i in range(bins):
        mask = (gray >= edges[i]) & (gray < edges[i + 1])
        out.extend([float(mask.mean()), float(gray[mask].std() / 128.0) if mask.any() else 0.0])
    return np.asarray(out, dtype=np.float32)


def extract_color(image_bgr: np.ndarray) -> dict[str, Any]:
    return {
        "lab": l2_normalize(lab_histogram(image_bgr)),
        "palette": l2_normalize(palette_histogram(image_bgr)),
        "warmcool": l2_normalize(warm_cool_vector(image_bgr)),
        "contrast": l2_normalize(contrast_vector(image_bgr)),
        "palette_swatches": dominant_palette(image_bgr),
    }


def edge_orientation_histogram(image_bgr: np.ndarray, bins: int = EDGE_BINS) -> np.ndarray:
    gray = cv2.cvtColor(cv2.resize(image_bgr, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 50, 150)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1)
    angle = (np.arctan2(gy, gx) + np.pi) % np.pi
    hist, _ = np.histogram(angle[edges > 0], bins=bins, range=(0, np.pi))
    hist = hist.astype(np.float32)
    return hist / (hist.sum() + 1e-9)


def _fallback_saliency(image_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(cv2.resize(image_bgr, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 50, 150).astype(np.float32)
    if edges.sum() <= 0:
        edges = cv2.Laplacian(gray, cv2.CV_32F)
    sal = cv2.resize(np.abs(edges), (SALIENCY_GRID, SALIENCY_GRID), interpolation=cv2.INTER_AREA).astype(np.float32)
    return sal / (sal.sum() + 1e-9)


@dataclass
class CompositionModel:
    model: Any
    cam: Any
    target_layers: Any
    ok: bool


@lru_cache(maxsize=1)
def get_composition_model() -> CompositionModel:
    try:
        import torch
        from pytorch_grad_cam import EigenCAM
        from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small

        model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.DEFAULT).eval()
        target_layers = [model.features[-1]]
        return CompositionModel(model=model, cam=EigenCAM(model=model, target_layers=target_layers), target_layers=target_layers, ok=True)
    except Exception:
        return CompositionModel(model=None, cam=None, target_layers=None, ok=False)


def extract_saliency(image_bgr: np.ndarray) -> np.ndarray:
    cm = get_composition_model()
    if not cm.ok:
        return _fallback_saliency(image_bgr).ravel()
    try:
        import torch
        from torchvision.transforms import Compose, Normalize, ToTensor

        rgb = cv2.cvtColor(cv2.resize(image_bgr, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
        tensor = Compose([
            ToTensor(),
            Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])(rgb).unsqueeze(0)
        with torch.no_grad():
            _ = cm.model(tensor)
        cam = cm.cam(input_tensor=tensor, targets=None)[0]
        cam = cv2.resize(cam.astype(np.float32), (SALIENCY_GRID, SALIENCY_GRID), interpolation=cv2.INTER_AREA)
        cam = np.clip(cam, 0, None)
        return (cam / (cam.sum() + 1e-9)).ravel().astype(np.float32)
    except Exception:
        return _fallback_saliency(image_bgr).ravel()


def extract_composition(image_bgr: np.ndarray) -> dict[str, np.ndarray]:
    return {
        "saliency": l2_normalize(extract_saliency(image_bgr)),
        "edges": l2_normalize(edge_orientation_histogram(image_bgr)),
    }


POSE_ANGLE_TRIPLES = [
    (5, 7, 9), (6, 8, 10), (11, 13, 15), (12, 14, 16),
    (5, 11, 13), (6, 12, 14), (7, 5, 11), (8, 6, 12),
    (5, 6, 8), (6, 5, 7), (11, 12, 14), (12, 11, 13),
]


@lru_cache(maxsize=1)
def get_pose_model() -> Any:
    from ultralytics import YOLO

    return YOLO(POSE_MODEL_PATH)


def _angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ba = a - b
    bc = c - b
    denom = np.linalg.norm(ba) * np.linalg.norm(bc)
    if denom <= 1e-9:
        return np.nan
    cos = np.clip(float(np.dot(ba, bc) / denom), -1.0, 1.0)
    return math.acos(cos) / math.pi


def pose_angles_from_keypoints(kpts: np.ndarray, conf: np.ndarray, min_conf: float = 0.3) -> np.ndarray:
    vals = []
    for a, b, c in POSE_ANGLE_TRIPLES:
        if conf[a] < min_conf or conf[b] < min_conf or conf[c] < min_conf:
            vals.append(np.nan)
        else:
            vals.append(_angle(kpts[a], kpts[b], kpts[c]))
    return np.asarray(vals, dtype=np.float32)


def extract_pose(image_bgr: np.ndarray) -> dict[str, Any]:
    try:
        model = get_pose_model()
        results = model.predict([image_bgr], verbose=False, imgsz=640, conf=0.25)
        result = results[0]
        descriptors = []
        keypoints = []
        if result.keypoints is not None and result.keypoints.xy is not None:
            xy = result.keypoints.xy.cpu().numpy()
            conf = result.keypoints.conf.cpu().numpy() if result.keypoints.conf is not None else np.ones(xy.shape[:2], dtype=np.float32)
            for person_xy, person_conf in zip(xy, conf, strict=False):
                angles = pose_angles_from_keypoints(person_xy, person_conf)
                if np.isfinite(angles).sum() >= 4:
                    descriptors.append(np.nan_to_num(angles, nan=-1.0))
                    keypoints.append(person_xy.astype(np.float32))
        desc = np.asarray(descriptors, dtype=np.float32)
        return {"has_pose": len(desc) > 0, "pose": desc, "keypoints": keypoints, "result": result if "result" in locals() else None}
    except Exception:
        return {"has_pose": False, "pose": np.zeros((0, len(POSE_ANGLE_TRIPLES)), dtype=np.float32), "keypoints": [], "result": None}


def pose_similarity(query_pose: np.ndarray, corpus_pose: np.ndarray, corpus_has_pose: np.ndarray) -> np.ndarray:
    out = np.full(corpus_has_pose.shape[0], np.nan, dtype=np.float32)
    if query_pose.size == 0:
        return out
    for i, has in enumerate(corpus_has_pose):
        if not has:
            continue
        cand = corpus_pose[i]
        best = -np.inf
        for q in query_pose:
            for c in cand:
                valid = (q >= 0) & (c >= 0)
                if valid.sum() < 4:
                    continue
                dist = float(np.mean(np.abs(q[valid] - c[valid])))
                best = max(best, 1.0 - min(dist, 1.0))
        if np.isfinite(best):
            out[i] = best
    return out


def visualize_step(image_bgr: np.ndarray, step: str) -> dict[str, Any]:
    if step == "composition":
        sal = extract_saliency(image_bgr).reshape(SALIENCY_GRID, SALIENCY_GRID)
        sal_big = cv2.resize(sal, (image_bgr.shape[1], image_bgr.shape[0]), interpolation=cv2.INTER_CUBIC)
        heat = cv2.applyColorMap(np.uint8(255 * sal_big / (sal_big.max() + 1e-9)), cv2.COLORMAP_MAGMA)
        overlay = cv2.addWeighted(image_bgr, 0.58, heat, 0.42, 0)
        edges = cv2.Canny(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY), 50, 150)
        return {"images": {"saliency": encode_png_data_url(overlay), "edges": encode_png_data_url(cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR))}}
    if step == "color":
        color = extract_color(image_bgr)
        swatches = np.zeros((80, 400, 3), dtype=np.uint8)
        x = 0
        for sw in color["palette_swatches"]:
            w = max(1, int(round(sw["weight"] * swatches.shape[1])))
            swatches[:, x : min(swatches.shape[1], x + w)] = np.asarray(sw["rgb"], dtype=np.uint8)[::-1]
            x += w
        return {"images": {"palette": encode_png_data_url(swatches)}, "palette": color["palette_swatches"]}
    if step == "pose":
        pose = extract_pose(image_bgr)
        if pose["result"] is not None:
            plotted = pose["result"].plot()
            return {"images": {"pose": encode_png_data_url(plotted)}, "has_pose": bool(pose["has_pose"])}
        return {"images": {"pose": encode_png_data_url(image_bgr)}, "has_pose": False}
    if step == "embeddings":
        # The embedding itself is numeric and not useful to render. Show a deterministic projection strip.
        small = cv2.resize(image_bgr, (96, 96), interpolation=cv2.INTER_AREA)
        return {"images": {"embedding_input": encode_png_data_url(small)}, "description": "Gemini embedding vector generated for this image."}
    raise ValueError(f"Unknown visualize step: {step}")
