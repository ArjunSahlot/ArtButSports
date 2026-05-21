# Scoring

ArtButSports scores the full corpus for every query with numpy arrays loaded in the FastAPI process. There is no vector DB and no candidate prefilter.

## Feature Sources

Embeddings use `gemini-embedding-2` image embeddings. Corpus vectors are built once by `scripts/build_features.py`; query time embeds only the uploaded image. Vectors are L2-normalized and compared with cosine similarity.

Composition uses two fixed vectors. `S_saliency` is a 16x16 L1-normalized MobileNetV3-small EigenCAM map, flattened and L2-normalized for cosine scoring. If the local CAM stack is unavailable during development, the code falls back to an edge-energy saliency map so subset builds can still exercise the pipeline. `S_edges` is a normalized Canny edge-orientation histogram with 12 bins. The notebook's EMD comparison is intentionally replaced because EMD is pairwise and not suitable for a precomputed vector table.

Color uses four fixed vectors from the color notebook. `S_lab` is concatenated 32-bin LAB channel histograms. `S_palette` is a vectorized 4x4x4 LAB palette histogram, chosen instead of per-query min-cost palette matching so scoring remains a matrix operation. `S_warmcool` stores warm and cool hue fractions. `S_contrast` stores global luminance statistics plus per-bin local contrast.

Pose uses Ultralytics YOLO pose nano from `POSE_MODEL_PATH` or `yolo26n-pose.pt`. Each detected person is converted to a vector of joint angles. Query-person and candidate-person descriptors are compared by mean absolute angle difference, and the best pair is used. Pose is undefined when either side has no confident pose.

## Calibration

`scripts/build_features.py` samples pairwise corpus similarities for each vector block and stores fixed `p05`/`p95` calibration statistics in the `.npz` feature table. At query time, raw similarities are mapped to `[0, 1]` with those fixed percentiles and clipped. This avoids per-query min-max behavior, so slider weights stay stable across different uploads.

Pose calibration uses fixed defaults (`p05=0.35`, `p95=0.95`) because the pose distribution is sparse and only valid for candidate/query pairs where both images contain detected people.

## Combination

Default top-level weights are:

- embeddings: `0.46`
- composition: `0.22`
- color: `0.22`
- pose: `0.10`

Composition defaults are saliency `0.70`, edges `0.30`. Color defaults are LAB `0.40`, palette `0.30`, warm/cool `0.10`, contrast `0.20`.

Sub-variable scores are combined within their parent after renormalizing enabled sub-weights. The final score is the weighted sum of enabled top-level sources, renormalized per candidate. If pose is disabled or undefined for a candidate, it is excluded from that candidate's denominator instead of shrinking the final score.

