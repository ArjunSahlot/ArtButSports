#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export FEATURE_TABLE_PATH="${FEATURE_TABLE_PATH:-data/features/artbutsports_features.npz}"
export IMAGE_MANIFEST_PATH="${IMAGE_MANIFEST_PATH:-data/vm_images/manifest.json}"
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:8000}"

uv run fastapi dev artbutsports/api/app.py --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT

cd frontend
exec bun run dev

