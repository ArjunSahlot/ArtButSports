#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export FEATURE_TABLE_PATH="${FEATURE_TABLE_PATH:-data/features/artbutsports_features.npz}"
export IMAGE_MANIFEST_PATH="${IMAGE_MANIFEST_PATH:-data/vm_images/manifest.json}"
exec uv run fastapi run artbutsports/api/app.py --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}"

