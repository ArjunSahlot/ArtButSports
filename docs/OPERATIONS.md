# Operations

## Environment Variables

Backend:

- `GEMINI_API_KEY`: required for feature builds and query-time embeddings.
- `FEATURE_TABLE_PATH`: path to the `.npz` feature table. Default: `data/features/artbutsports_features.npz`.
- `IMAGE_MANIFEST_PATH`: path to the VM image manifest. Default: `data/vm_images/manifest.json`.
- `POSE_MODEL_PATH`: YOLO pose model path. Default: `yolo26n-pose.pt`.
- `FRONTEND_ORIGIN`: Vercel production origin allowed by CORS.
- `HOST`, `PORT`: optional server bind settings for `scripts/run_backend.sh`.

Frontend:

- `NEXT_PUBLIC_API_BASE_URL`: public backend base URL, for example `http://localhost:8000` in dev or the VM URL in Vercel.

## Local Subset Build

Use a small subset to verify the full pipeline before spending time and Gemini quota on the full corpus:

```bash
uv sync
python scripts/build_features.py --sample 100 --output data/features/artbutsports_features.npz --keep-checkpoint
python scripts/setup_vm_images.py --limit 100 --manifest data/vm_images/manifest.json
scripts/dev.sh
```

`--skip-embeddings` exists only for debugging local feature extraction. Do not use it for acceptance or production because it makes embedding scores meaningless.

## Resumable Feature Builds

`scripts/build_features.py` writes per-artwork checkpoint records under `<output_stem>_checkpoint/records/` by default. Each record tracks completion separately for `embedding`, `composition`, `color`, and `pose`.

If the process crashes, rerun the same command. The script validates that the checkpoint config matches the current flags, skips completed feature groups, and retries only holes. If one feature fails for an artwork, the other successful features are still saved and the record remains incomplete until a later run fills the missing group.

Useful flags:

- `--checkpoint-dir PATH`: put checkpoint records somewhere explicit.
- `--checkpoint-every N`: update manifest/failure summaries every N processed artworks.
- `--download-workers N`: parallel image download workers. Default: `16`.
- `--embedding-workers N`: parallel Gemini embedding workers. Default: `8`.
- `--keep-checkpoint`: keep complete checkpoint records after a successful build.
- `--fresh`: delete the checkpoint and start over. Use this only when you intentionally want to discard saved work.

The final `.npz` includes complete rows only and stores `incomplete_summary` so operators can see whether any rows were left out. If incomplete records remain, the checkpoint is kept even without `--keep-checkpoint`.

Build stages are intentionally separated for speed and stability. Downloads are prefetched concurrently first, local model features run next, and embeddings are filled concurrently at the end. This keeps external API latency from blocking local GPU/CPU work while avoiding multiple simultaneous YOLO/CAM jobs competing for VRAM.

## Full Local Build

Run this on the fast local machine:

```bash
python scripts/build_features.py \
  --metadata data/img-metadata-CC0-clean.csv \
  --cache-dir data/cache/images \
  --output data/features/artbutsports_features.npz
```

The script is resumable for downloads because it keeps successfully downloaded images in `--cache-dir`. Per-image failures are written to `data/features/failures.csv`.

## VM Image Setup

Copy `data/features/artbutsports_features.npz` to the VM, then run:

```bash
python scripts/setup_vm_images.py \
  --metadata data/img-metadata-CC0-clean.csv \
  --image-dir data/vm_images/images \
  --manifest data/vm_images/manifest.json
```

The manifest maps corpus ids to local image paths. The backend serves `/images/{id}` from this manifest.

## Start Backend

On the VM:

```bash
export GEMINI_API_KEY=...
export FRONTEND_ORIGIN=https://your-vercel-domain.vercel.app
export FEATURE_TABLE_PATH=/path/to/artbutsports_features.npz
export IMAGE_MANIFEST_PATH=/path/to/manifest.json
scripts/run_backend.sh
```

## Vercel Handoff

Deploy `frontend/` to Vercel and set:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-vm-api-origin
```

Set the backend `FRONTEND_ORIGIN` to the exact Vercel origin.
