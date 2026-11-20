# Screenshots

These three images are a **radar-5** dashboard render committed in `25646d8` (`Token Radar (radar-5): fitted log-log curve, out-of-sample validation, 195-row board`).

The page chrome in the images says radar-5. They were not regenerated when the docs were aligned with the scorer. The external snapshot used for that render is not in this repository, so the numbers visible in the images were not recomputed here. Some of those numbers also differ from figures named in comments in `lib/model.ts` (for example the chart caption's R² and the comment's R²). Treat both as unverified prior-run claims until that snapshot is available.

`main.ts` copies these files into the output directory. A run on `examples/synthetic-snapshot.json` does not replace them, and the copied images are not a picture of the synthetic board.
