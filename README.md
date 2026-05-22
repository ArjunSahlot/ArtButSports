# ArtButSports

ArtButSports is a local-first web app for finding visually similar CC0 artworks from the Cleveland Museum of Art corpus.

## Prerequisites

- WSL Ubuntu
- Python 3.13+
- `uv`
- Bun for the frontend
- `GEMINI_API_KEY` in `.env`

## Quickstart

```bash
uv sync
python scripts/build_features.py --sample 100 --output data/features/artbutsports_features.npz
python scripts/setup_vm_images.py --limit 100
scripts/dev.sh
```

Backend runs on `http://localhost:8000`; frontend runs on `http://localhost:3000`.

## Required Environment

Backend: `GEMINI_API_KEY`, `FEATURE_TABLE_PATH`, `IMAGE_MANIFEST_PATH`, `POSE_MODEL_PATH`, `FRONTEND_ORIGIN`.

Frontend: `NEXT_PUBLIC_API_BASE_URL`.

## Local to VM to Vercel Flow

1. Build the full feature table on a fast local machine:

```bash
python scripts/build_features.py --output data/features/artbutsports_features.npz
```

2. Copy the feature table and repository to the VM.

3. Download VM-local corpus images and manifest:

```bash
python scripts/setup_vm_images.py
```

4. Start the VM backend:

```bash
scripts/run_backend.sh
```

5. Deploy `frontend/` to Vercel with `NEXT_PUBLIC_API_BASE_URL` pointed at the VM backend and set backend `FRONTEND_ORIGIN` to the Vercel origin.

For the current GCP VM backend setup, use `docs/GCP_VM_SETUP.md`.
