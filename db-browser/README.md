# ArtButSports DB Browser

Local-only database browser for polishing and pipeline inspection.

```bash
cd db-browser
../.venv/bin/python scripts/build_index.py
../.venv/bin/python -m http.server 5174
```

Then open `http://localhost:5174`.

The index builder reads:

- `../data/img-metadata-CC0-clean.csv`
- `../data/features/artbutsports_features.npz`

It writes a compact browser index to `public/data/index.json`. The UI never mutates source data.
