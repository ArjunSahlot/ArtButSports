from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from artbutsports.features import embed_image_bytes_async, read_image_bytes, visualize_step
from artbutsports.scoring import DEFAULT_WEIGHTS, FeatureStore, load_feature_store, query_feature_blocks, score_query

load_dotenv()

FEATURE_TABLE_PATH = os.getenv("FEATURE_TABLE_PATH", "data/features/artbutsports_features.npz")
IMAGE_MANIFEST_PATH = os.getenv("IMAGE_MANIFEST_PATH", "data/vm_images/manifest.json")
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
    if Path(FEATURE_TABLE_PATH).exists():
        STORE = load_feature_store(FEATURE_TABLE_PATH)
    if Path(IMAGE_MANIFEST_PATH).exists():
        IMAGE_MANIFEST = json.loads(Path(IMAGE_MANIFEST_PATH).read_text())


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


@app.post("/query")
async def query(
    image: Annotated[UploadFile, File()],
    weights: Annotated[str | None, Form()] = None,
    offset: Annotated[int, Form()] = 0,
    limit: Annotated[int, Form()] = 30,
) -> dict[str, Any]:
    if STORE is None:
        raise HTTPException(status_code=503, detail="Feature table is not loaded")
    data = await image.read()
    image_bgr = read_image_bytes(data)
    embedding = await embed_image_bytes_async(data, image.content_type or "image/jpeg")
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
        try:
            embedding = await embed_image_bytes_async(data, image.content_type or "image/jpeg")
            return {"step": step, "dimensions": int(embedding.shape[0]), **visualize_step(image_bgr, step)}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Embedding failed: {exc}") from exc
    return {"step": step, **visualize_step(image_bgr, step)}

