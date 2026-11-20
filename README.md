[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/WuYuanJie-211/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/WuYuanJie-211/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar

Token Radar is an offline prototype. It reads one local JSON snapshot, scores protocols that record no token, and writes a ranked board plus a static dashboard. The scorer in this repository is **radar-5** (`MODEL_VERSION` in `lib/model.ts`).

It is not a live market feed, not a forecast of a future token price, not a finder that guarantees a token or an airdrop, not an automatic trading system, and not a hosted or billed product.

Node.js 22 and the standard library are enough. Nothing is installed from a package registry, and `main.ts` does not open a network connection. The run checked for this documentation update used Node `v22.23.4`.

## Current method

Implied value is an implied circulating market cap if a protocol launched, times a launch-odds factor taken from the same snapshot. It is not a traded price. One function scores every row. Family offsets, double-count factors and plausibility rules are tables the function reads.

```
log10(mcap) = a + b * log10(TVL)
```

`a` and `b` are a Huber fit (IRLS, k = 1.345, at most 25 rounds) on the snapshot's own fee-token pool: `mcap_usd > 0`, `tvl_usd > 0`, `mcap/TVL` in `(0, 3]`, and category not `CEX`, `Bridge`, `Canonical Bridge` or `Cross Chain Bridge`. The scorer rounds `a` and `b` to 4 decimals and uses those rounded numbers. They are computed from the input at run time. This checkout did not recompute them for the external DefiLlama snapshot.

```
V = 10^(a + b*log10(TVL) + family_offset + log10(momentum))
    * double_count * plausibility
implied = max(1, round(V * launch_odds))
```

Constants in `MODEL`:

| Piece | Rule |
| --- | --- |
| Family offset | Shrunk median residual of a named family, times `n/(n+16)`. No named family means 0. |
| Momentum | `1 + 0.25 * clamp(change_7d, -25, +25) / 100`, so at most about ±6%. A missing change is treated as 0. |
| Double-count | 0.50 Risk Curators and Onchain Capital Allocator; 0.75 Restaking, Collateral Markets and Staking Pool; 1.00 otherwise. |
| Plausibility | First matching published rule: 0.20 token-exists slugs, 0.10 `lightning-network`, 0.20 category Chain, 0.50 `lagoon`, 0.50 category Risk Curators, else 1.00. |
| Launch odds | Share of protocols whose `listed_at` is at least this many days before `as_of` and that are not pre-token. A missing date uses 512 days. |
| Band | Half-width in log10 is `sqrt(loo_sd^2 + refit_sd^2)`. P25–P75 uses ±0.6745, P10–P90 uses ±1.2816. Refit spread is 200 deterministic bootstrap refits, seed `20261119`. |

A protocol is pre-token when `mcap_usd`, `gecko_id` and `symbol` are all null. The board keeps every watchlist slug that exists in `protocols`, then pre-token rows at or above `floor_usd` that the house rule does not exclude, then up to 200 pre-token rows below the floor, by TVL. House exclusions, in order: CEX, bridge categories, Liquid Staking / Liquid Restaking / Restaked BTC, a versioned name, a wrapped or staked name, or a name whose first word matches a protocol that is not pre-token. The live view lists up to 24 non-CEX protocols that are not pre-token, by market cap. They are not mixed into the ranked board.

`validateModel` also writes leave-one-out and two walk-forward comparisons (cuts `2025-01-01` and `2025-06-30`) against a flat overall-median baseline, plus an ablation table. Those numbers depend on the input. The sentence stored in `validation.conclusion` always begins “The fitted curve beats the flat baseline…”. Read the multiples in that sentence: on the synthetic fixture below, the curve's median miss is larger than the baseline's, so that sentence overstates the comparison. The wording is part of the existing scorer and was not changed.

Farm text for a short list of slugs is written out in `lib/model.ts`. Every other row gets a six-step plan from its category, chain and age. The money line uses a default deposit of $1,000, a drop share of 0.10, and a 4% forgone yield. Points are not given a dollar value. A verdict is `FARM` when break-even odds are at most 0.15, `THIN` at most 0.40, otherwise `SKIP`.

## What was run for this documentation update

The external snapshot is not in this repository. The commands below were run on the synthetic fixture only, on Node `v22.23.4`.

```sh
node examples/make-synthetic-snapshot.mjs
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input examples/synthetic-snapshot.json
node scripts/gate-check.mjs out examples/synthetic-snapshot.json
```

Regenerating the fixture is optional; `examples/synthetic-snapshot.json` is already checked in. Two runs with the same input wrote byte-identical output (`diff -rq` clean). `gate-check.mjs` printed `gate-check: ALL PASS` (19 PASS lines). The run printed:

```text
token radar: 159 protocols, 40 on the watchlist, 125 rows scored (70 early, 24 live set aside)
token radar: watchlist implied sum $49,575,385
```

Those figures belong to the invented fixture. They are not DefiLlama results. The full walk-through of one row is in `docs/example.md`.

A missing file exits 1:

```text
token radar: no snapshot at /input/snapshot.json: pass --input <snapshot.json|directory> or mount the sealed /input
```

The same message is printed for `--input` pointing at a path that is not there.

## What this checkout cannot reproduce

`../token-radar-01-kit/input/snapshot.json` and `/input/snapshot.json` are not in this workspace. Without that external snapshot, this checkout cannot rebuild the historical board, the committed screenshots, or the fit coefficients named in comments.

Keep these apart:

- **Historical write-ups.** `docs/methodology.md` §§1–10, `docs/validation.md` and `docs/verification.md` record radar-2, radar-3 and radar-4 research dated 2026-11-18. They are not a description of radar-5, and their dollar figures were not recomputed here.
- **Unverified claims in the tree.** The radar-5 commit message says “195-row board”. Comments in `lib/model.ts` and `dashboard/app.js` name a 92-protocol fee-token fit (`a = 2.8719`, `b = 0.5195`) and particular held-out misses. The committed screenshots are a radar-5 page whose chrome shows 195 ranked rows, a watchlist sum of $208.2M, and some fit figures that do not match every number in those comments (the chart caption on the screenshot shows R² 0.26, while a comment says R² 0.33). None of those headline figures was recomputed in this update.
- **Verified here.** The synthetic run above: radar-5, 125 rows, the commands, the exit on a missing snapshot, and a byte-identical second run.

## Input

`parseSnapshot` accepts a JSON object:

| Field | Required shape |
| --- | --- |
| `as_of` | `YYYY-MM-DD` |
| `source` | string |
| `floor_usd` | positive safe integer |
| `watchlist` | array of slug strings |
| `protocols` | array of objects |

Each protocol needs `slug` (string), `name` (string) and `tvl_usd` (finite number). `category` and the chain names are strings or else empty. `change_7d` and `mcap_usd` are finite numbers or else null. `listed_at`, `gecko_id` and `symbol` are strings or else null. Extra keys, including the fixture's `note`, are ignored.

Paths:

- Checked-in synthetic input: `examples/synthetic-snapshot.json`
- External snapshot named by older docs, not present here: `../token-radar-01-kit/input/snapshot.json`
- Default when `--input` is omitted: `/input/snapshot.json`

`--input` may be the JSON file or a directory that contains `snapshot.json`. `--output`, or else `MAKEFUN_OUTPUT_DIR`, or else `/output`, is the output directory.

## Output and the local dashboard

A successful run writes:

| Path | Contents |
| --- | --- |
| `board.json` | `{ "rows": [ ... ] }`. Rank, identity, TVL, `implied_value_usd`, a `model` object (curve factors, odds, band, comparables), `farm`, and `farm_steps`. |
| `data.js` | `window.RADAR=...;` for the page. Includes `model_version`, the fit, validation, ledger and the same rows. |
| `dashboard/` | Copy of this repo's `dashboard/` (`index.html`, `app.css`, `app.js`). |
| `screenshots/` | Copy of this repo's `screenshots/`. Not a new capture of the run. |
| `dossier.json` | `buildDossier` over that output directory. |

`dashboard/index.html` loads `../data.js`, so the page has to be opened with `data.js` as a sibling of `dashboard/`. From the output directory:

```sh
python3 -m http.server 8765 --directory out
```

Then open `http://127.0.0.1:8765/dashboard/`. The page does not fetch a remote API. `#detail=0` shows the board without the rank-1 detail. The live-token control is on the page.

`scripts/gate-check.mjs out examples/synthetic-snapshot.json` checks the output shape, that `data.js` says `radar-5`, and that `dossier.json` matches `buildDossier`. It does not check that the copied screenshots depict the board just written. On the synthetic run they do not: they are the committed radar-5 images described below. The script's pass line says `40/40` whenever every slug in the file's `watchlist` is on the board. The synthetic watchlist happens to have 40 slugs.

The page copies a few labels from the external-snapshot write-up rather than from the file just scored. `dashboard/app.js` always prints “DefiLlama protocol index”, the heading “Forty watchlist protocols”, the badge “40/40”, and a ledger prefix of `758 =` in front of the ranked, traded and set-aside counts. On the synthetic run those counts are 125, 31 and 3 (159 protocols). The leading 758 is that fixed label. The date and `radar-5` on the same bar do come from the output (`2026-01-15` on the fixture). This was checked by opening `http://127.0.0.1:8765/dashboard/#detail=0` against the synthetic output. The page source was not changed.

## Screenshots

`screenshots/1-board.png`, `screenshots/2-detail.png` and `screenshots/3-filtered.png` are a radar-5 render committed with `25646d8`. The page chrome in the images says radar-5. They were not regenerated for this documentation update, because the external snapshot they were rendered from is not available here. Treat the numbers visible in the images as a prior run's output, not as a result verified in this checkout. See `screenshots/README.md`.

## Limitations

- The board ranks an input snapshot. It does not quote a market and it does not say that a token will be issued.
- Fit quality, family offsets and launch odds move when the input changes. The synthetic fixture's curve does not beat its own flat baseline; that is reported in `docs/example.md` and is not a statement about any other snapshot.
- Most of the specific farm paragraphs are tied to slug strings. A synthetic slug receives the generic six-step plan.
- Gas, hold length and the 3–8% style yield language inside some farm paragraphs are estimates written into the scorer. The money line prices points at $0.
- `listed_at` is a field of the input, used as an age proxy.
- The committed screenshots can disagree with a newly written `board.json`, because `main.ts` copies the image files from the repository.

## Provenance

`LICENSE` is the MIT text already in the repository, including the copyright line printed in that file and `SPDX-License-Identifier: MIT`. GitHub reports this repository's license as Other / NOASSERTION. Those two facts do not, by themselves, show who can grant commercial rights, and they do not show that commercial permission is missing.

`vendor/makefun-board.ts` is byte-identical to `starter/vendor/makefun-board.ts` in the token-radar-01 kit metadata served at `https://make.fun/api/competitions/token-radar-01/kit` on 2026-11-20 (SHA-256 `9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e`). Its header says it is make.fun's dossier library. Keep the file and that header.

The first commit's `LICENSE` (`61aa533`) has the same SHA-256 as that kit's `starter/LICENSE` (`c31b3812c449f571742f26f51db65810331e15ca53b9ee492f739288da6c6d36`). Later commits moved the SPDX line; the copyright line is the one introduced in the first commit. The same copyright line appears in other public bounty repositories. A matching line is not a finding that one party owns every file in this repository.

`main.ts`, `lib/model.ts`, the dashboard sources and the screenshots do not match the starter hashes in that same kit metadata, including at the first commit for the files that already existed. GitHub does not record this repository as a fork. Line-by-line overlap with the starter model was not measured: the kit archive also contains the sealed snapshot and was not downloaded.

The historical docs and the screenshots discuss a DefiLlama-derived snapshot that is not stored here. DefiLlama's terms (`https://defillama.com/terms`, effective 24 June 2025) and its API FAQ (`https://docs.llama.fi/faqs/frequently-asked-questions`) are separate from this repository's source text. This note does not decide how those data terms apply.

`.makefun/owner.json` is a bounty claim file. It is not a copyright assignment. This note does not repeat its contents.

Commercial redistribution, bounty rules and tool-provider terms have to be checked against the kit and the competition text that applied to a given submission, and against the person who published the repository. This note does not transfer, waive or confirm those rights.

## Layout

- `main.ts` — reads the snapshot and writes the output directory
- `lib/model.ts` — radar-5 scorer, board builder and farm plans
- `dashboard/` — static page
- `screenshots/` — prior radar-5 render; see `screenshots/README.md`
- `examples/` — synthetic snapshot and the script that writes it
- `docs/example.md` — one synthetic row, recomputed from a local run
- `docs/methodology.md`, `docs/validation.md`, `docs/verification.md` — historical radar-2/3/4 notes
- `vendor/makefun-board.ts` — dossier library from the kit
- `scripts/gate-check.mjs` — local check of an output directory

Referral code: `yscmfwa4` (https://make.fun/r/yscmfwa4)
