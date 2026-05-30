# ArtButSports Benchmark

This folder contains a local ranking benchmark for the current ArtButSports
pipeline. Each benchmark case has a target image and one or more expected
output images. The runner extracts features for those images, temporarily
appends the expected outputs to the loaded feature store in memory, ranks the
augmented store with the current scorer, and reports how high the expected
outputs appear.

Expected outputs are always treated as not already being in the database. They
are never written to `data/features/artbutsports_features.npz`.

## Case Manifest

Use JSON for normal benchmark sets:

```json
{
  "cases": [
    {
      "id": "lebron_jump",
      "target": "images/targets/lebron_jump.jpg",
      "outputs": [
        "images/outputs/classical_jump_pose.jpg",
        {
          "id": "runnerup",
          "path": "images/outputs/similar_composition.jpg"
        }
      ]
    }
  ]
}
```

Paths are resolved relative to the manifest file first, then relative to the
repo root if needed. The runner also accepts CSV with these columns:

```csv
case_id,target,output,label
lebron_jump,images/targets/lebron_jump.jpg,images/outputs/classical_jump_pose.jpg,primary
```

Multiple CSV rows with the same `case_id` and `target` become multiple expected
outputs for that target.

## Run

From the repo root:

```bash
uv run python benchmark/run.py --cases benchmark/cases.json
```

If `uv` is not on your WSL `PATH`, use the repo virtualenv directly:

```bash
.venv/bin/python benchmark/run.py --cases benchmark/cases.json
```

Useful options:

```bash
uv run python benchmark/run.py \
  --cases benchmark/cases.json \
  --weights benchmark/weights.json \
  --output benchmark/runs/latest.json \
  --top-n 20 \
  --device auto
```

The default output is a timestamped JSON report in `benchmark/runs/`. The main
score is mean reciprocal rank of the best expected output per target, where
`1.0` means every target ranked an expected output first. The report also
includes `hit@k`, `recall@k`, `ndcg@k`, per-case ranks, score breakdowns, and
top competing corpus items.

Feature extraction is cached under `benchmark/.cache/features/`. Delete that
directory or pass `--refresh-cache` when you need to force recomputation.

## Smoke Tests

For syntax and CLI validation without calling Gemini:

```bash
uv run python benchmark/run.py --help
uv run python -m py_compile benchmark/run.py
```

`--skip-embeddings` is available for local smoke tests, but it is not a real
pipeline benchmark because the production scorer uses Gemini image embeddings.
