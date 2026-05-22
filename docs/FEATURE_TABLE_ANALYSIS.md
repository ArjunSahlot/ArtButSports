# Feature Table Analysis

Generated from `data/features/artbutsports_features.npz`.

## Completeness

- Complete rows in table: `19,996`
- Source metadata rows: `20,000`
- Table size: `236.0 MB`
- Incomplete checkpoint rows: `4`
- Missing groups: `{'embedding': 4, 'composition': 4, 'color': 4, 'pose': 4}`
- Recorded failures: `47`
- Failure stages: `{'download': 40, 'embedding': 7}`

The final table is usable. It contains only complete rows; the four incomplete checkpoint records were excluded from the packed `.npz`.

## Feature Shapes

- `embeddings`: `(19996, 3072)`, `float32`, finite: `True`
- `saliency`: `(19996, 256)`, `float32`, finite: `True`
- `edges`: `(19996, 12)`, `float32`, finite: `True`
- `lab`: `(19996, 96)`, `float32`, finite: `True`
- `palette`: `(19996, 64)`, `float32`, finite: `True`
- `warmcool`: `(19996, 2)`, `float32`, finite: `True`
- `contrast`: `(19996, 23)`, `float32`, finite: `True`
- `pose`: `(19996, 4, 12)`, `float32`, finite: `True`

## Pose

- Images with detected pose: `9,600` / `19,996` (`48.01%`)

## Calibration

- `embeddings`: p05 `0.5677`, p95 `0.7311`
- `saliency`: p05 `0.1342`, p95 `0.8926`
- `edges`: p05 `0.6477`, p95 `0.9838`
- `lab`: p05 `0.2245`, p95 `0.9448`
- `palette`: p05 `0.0712`, p95 `0.9288`
- `warmcool`: p05 `0.7031`, p95 `1.0000`
- `contrast`: p05 `0.7327`, p95 `0.9835`
- `pose`: p05 `0.3500`, p95 `0.9500`

## Coverage By Department

- Prints: `10,156`
- Indian and Southeast Asian Art: `2,203`
- Drawings: `1,900`
- Japanese Art: `1,350`
- Photography: `1,131`
- Chinese Art: `798`
- European Painting and Sculpture: `637`
- Modern European Painting and Sculpture: `449`
- Medieval Art: `287`
- American Painting and Sculpture: `278`
- Art of the Americas: `218`
- Egyptian and Ancient Near Eastern Art: `184`

## Coverage By Type

- Print: `10,694`
- Painting: `3,949`
- Drawing: `1,964`
- Sculpture: `1,827`
- Photograph: `988`
- Portfolio: `428`
- Sampler: `84`
- Tapestry: `56`
- Mosaic: `6`

