# ArtButSports Benchmark

This folder contains a local ranking benchmark for the current ArtButSports
pipeline. Each benchmark case is a folder with one input image and one or more
target images. The runner extracts features for those images, temporarily
appends the targets to the loaded feature store in memory, ranks the augmented
store with the current scorer, and reports how high the targets appear.

Targets are always treated as not already being in the database. They are never
written to `data/features/artbutsports_features.npz`.

## Case Folder

Pass the runner a folder containing one subfolder per benchmark case:

```text
benchmark/cases/
  lebron_jump/
    input.jpg
    classical_jump_pose.jpg
    similar_composition.png
  wnba_drive/
    input.png
    painting_target.jpg
```

The file named `input` is the query image. It can use any supported image
extension, such as `input.jpg`, `input.png`, or `input.webp`. Every other image
file in the same subfolder is a target that should rank as high as possible.

The case id is the subfolder name. Target ids come from each target image's file
stem.

## Run

From the repo root:

```bash
uv run python benchmark/run.py benchmark/cases
```

If `uv` is not on your WSL `PATH`, use the repo virtualenv directly:

```bash
.venv/bin/python benchmark/run.py benchmark/cases
```

Useful options:

```bash
uv run python benchmark/run.py \
  benchmark/cases \
  --weights benchmark/weights.json \
  --output benchmark/runs/latest.json \
  --top-n 20 \
  --device auto
```

The default output is a timestamped JSON report in `benchmark/runs/`. The main
score is mean reciprocal rank of the best target per input, where `1.0` means
every input ranked a target first. The report also
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
