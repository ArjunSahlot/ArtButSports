from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from artbutsports.features import embed_image_bytes_async, embedding_vector_svg, read_image_bytes, visualize_step
from artbutsports.scoring import DEFAULT_WEIGHTS, FeatureStore, load_feature_store, query_feature_blocks, score_query

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

logger = logging.getLogger(__name__)


def resolve_data_path(path: str) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else PROJECT_ROOT / candidate


FEATURE_TABLE_PATH = os.getenv("FEATURE_TABLE_PATH", "data/features/artbutsports_features.npz")
IMAGE_MANIFEST_PATH = os.getenv("IMAGE_MANIFEST_PATH", "data/vm_images/manifest.json")
DEMO_IMAGE_DIR = os.getenv("DEMO_IMAGE_DIR", "data/demos")
VISUALIZE_SAMPLE_DIR = os.getenv("VISUALIZE_SAMPLE_DIR", "data/visualize_samples")
VISUALIZE_SAMPLE_BEFORE = "demo.png"
VISUALIZE_SAMPLE_AFTER = {
    "composition": "demo_composition.png",
    "color": "demo_color.png",
    "pose": "demo_pose.png",
}
LOCALHOST_ORIGIN = "http://localhost:3000"
PRODUCTION_ORIGIN = os.getenv("FRONTEND_ORIGIN", "")

app = FastAPI(title="ArtButSports API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in [LOCALHOST_ORIGIN, PRODUCTION_ORIGIN] if o],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

STORE: FeatureStore | None = None
IMAGE_MANIFEST: dict[str, str] = {}


@app.on_event("startup")
def startup() -> None:
    global STORE, IMAGE_MANIFEST
    feature_path = resolve_data_path(FEATURE_TABLE_PATH)
    if feature_path.exists():
        STORE = load_feature_store(str(feature_path))
        logger.info("Loaded feature table from %s (%d items)", feature_path, len(STORE.ids))
    else:
        logger.warning("Feature table not found at %s", feature_path)
    manifest_path = resolve_data_path(IMAGE_MANIFEST_PATH)
    if manifest_path.exists():
        IMAGE_MANIFEST = json.loads(manifest_path.read_text())
        logger.info("Loaded image manifest from %s (%d images)", manifest_path, len(IMAGE_MANIFEST))
    else:
        logger.warning("Image manifest not found at %s", manifest_path)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "features_loaded": STORE is not None, "images_mapped": len(IMAGE_MANIFEST)}


@app.get("/defaults")
def defaults() -> dict[str, Any]:
    return DEFAULT_WEIGHTS


@app.get("/images/{art_id}")
def image(art_id: str) -> FileResponse:
    path = IMAGE_MANIFEST.get(str(art_id))
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/demos")
def demos() -> dict[str, Any]:
    demo_dir = resolve_data_path(DEMO_IMAGE_DIR)
    if not demo_dir.exists():
        return {"items": []}
    items = []
    for path in sorted(demo_dir.iterdir()):
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        name = path.stem.replace("_", " ").replace("-", " ").title()
        items.append({"name": name, "filename": path.name, "url": f"/demos/{path.name}"})
    return {"items": items}


@app.get("/demos/{filename}")
def demo_image(filename: str) -> FileResponse:
    demo_dir = resolve_data_path(DEMO_IMAGE_DIR)
    path = (demo_dir / filename).resolve()
    if demo_dir.resolve() not in path.parents or not path.exists() or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=404, detail="Demo image not found")
    media_type = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(path, media_type=media_type)


@app.post("/query")
async def query(
    image: Annotated[UploadFile, File()],
    weights: Annotated[str | None, Form()] = None,
    offset: Annotated[int, Form()] = 0,
    limit: Annotated[int, Form()] = 30,
) -> dict[str, Any]:
    data = await image.read()
    return await run_query_bytes(data, image.content_type or "image/jpeg", weights, offset, limit)


@app.post("/query/demo")
async def query_demo(
    filename: Annotated[str, Form()],
    weights: Annotated[str | None, Form()] = None,
    offset: Annotated[int, Form()] = 0,
    limit: Annotated[int, Form()] = 30,
) -> dict[str, Any]:
    demo_dir = resolve_data_path(DEMO_IMAGE_DIR)
    path = (demo_dir / filename).resolve()
    if demo_dir.resolve() not in path.parents or not path.exists() or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=404, detail="Demo image not found")
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return await run_query_bytes(path.read_bytes(), mime, weights, offset, limit)


async def run_query_bytes(
    data: bytes,
    mime_type: str,
    weights: str | None,
    offset: int,
    limit: int,
) -> dict[str, Any]:
    if STORE is None:
        raise HTTPException(status_code=503, detail="Feature table is not loaded")
    image_bgr = read_image_bytes(data)
    try:
        embedding = await embed_image_bytes_async(data, mime_type)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Embedding failed: {exc}") from exc
    weight_payload = json.loads(weights) if weights else None
    query_blocks = query_feature_blocks(image_bgr, embedding)
    scores = score_query(STORE, query_blocks, weight_payload)
    order = scores["total"].argsort()[::-1]
    page = order[offset : offset + max(1, min(limit, 100))]
    items = []
    for idx in page:
        meta = dict(STORE.metadata[int(idx)])
        art_id = str(STORE.ids[int(idx)])
        image_url = f"/images/{art_id}" if art_id in IMAGE_MANIFEST else meta.get("image_web")
        items.append(
            {
                "id": art_id,
                "image_url": image_url,
                "title": meta.get("title"),
                "creators": meta.get("creators"),
                "accession_number": meta.get("accession_number"),
                "scores": {
                    "total": float(scores["total"][idx]),
                    "embeddings": float(scores["embeddings"][idx]),
                    "composition": float(scores["composition"][idx]),
                    "color": float(scores["color"][idx]),
                    "pose": float(scores["pose"][idx]) if scores["pose_valid"][idx] else None,
                    "saliency": float(scores["saliency"][idx]),
                    "edges": float(scores["edges"][idx]),
                    "lab": float(scores["lab"][idx]),
                    "palette": float(scores["palette"][idx]),
                    "warmcool": float(scores["warmcool"][idx]),
                    "contrast": float(scores["contrast"][idx]),
                },
            }
        )
    return {"items": items, "offset": offset, "next_offset": offset + len(items), "total": len(order)}


@app.post("/visualize/step")
async def visualize(
    image: Annotated[UploadFile, File()],
    step: Annotated[str, Form()],
) -> dict[str, Any]:
    data = await image.read()
    image_bgr = read_image_bytes(data)
    if step == "embeddings":
        return {"step": step, "dimensions": 3072, **visualize_step(image_bgr, step)}
    return {"step": step, **visualize_step(image_bgr, step)}


@app.get("/visualize/samples/{filename}")
def visualize_sample_file(filename: str) -> FileResponse:
    sample_dir = resolve_data_path(VISUALIZE_SAMPLE_DIR)
    path = (sample_dir / filename).resolve()
    if sample_dir.resolve() not in path.parents or not path.exists() or path.suffix.lower() != ".png":
        raise HTTPException(status_code=404, detail="Visualization sample not found")
    return FileResponse(path, media_type="image/png")


@app.get("/visualize/sample/{step}")
async def visualize_sample(step: str) -> dict[str, Any]:
    sample_dir = resolve_data_path(VISUALIZE_SAMPLE_DIR)
    before_path = (sample_dir / VISUALIZE_SAMPLE_BEFORE).resolve()
    if sample_dir.resolve() not in before_path.parents or not before_path.exists():
        raise HTTPException(status_code=503, detail="Visualization sample image is not available")
    before_url = f"/visualize/samples/{VISUALIZE_SAMPLE_BEFORE}"
    payload = {"sample_id": before_path.stem, "before": before_url, "step": step}
    if step == "embeddings":
        return {
            **payload,
            "dimensions": 3072,
            "images": {"embedding": embedding_vector_svg()},
            "description": "The image is represented as a normalized Gemini embedding vector for semantic comparison.",
        }
    after_name = VISUALIZE_SAMPLE_AFTER.get(step)
    if not after_name:
        raise HTTPException(status_code=404, detail=f"Unknown visualize step: {step}")
    after_path = (sample_dir / after_name).resolve()
    if not after_path.exists():
        raise HTTPException(status_code=503, detail="Visualization sample image is not available")
    return {**payload, "images": {step: f"/visualize/samples/{after_name}"}}
