# token-radar-02 — Validation (radar-3)

Date: 2026-11-18. Model: radar-3 (`lib/model.ts`, `MODEL_VERSION = 'radar-3'`).
Snapshot: DefiLlama `api.llama.fi/protocols`, fetched 2026-11-14T01:18:33Z,
`as_of` 2026-11-14, floor $50M, 758 protocols, 40 watchlist.
All numbers below are recomputed from that snapshot at build time by
`validateModel()` in `lib/model.ts` — nothing here is hand-copied, and
re-running `main.ts` reproduces them byte-for-byte (two runs compared,
identical). Errors are log-scale RMSE on held-out log(mcap); R² is on
held-out log(mcap) too. A log-RMSE of 1.78 means the typical held-out
prediction is off by a factor of about e^1.78 ≈ 5.9x — mcap/TVL is a
noisy ratio, and the absolute errors are large; what matters here is the
comparison between models on identical splits, not the level.

## 0. Final model (chosen by the validation below)

- Core: `log mcap = 0.5 · ridge + 0.5 · baseline`, in log space.
  - Ridge: log(mcap) on log(TVL), (log TVL − 17.5)² (size curve), log(age),
    log(1 + chains), category dummies (categories with ≥ 3 comps);
    features standardised, intercept unpenalised, λ = 100, solved by
    hand-written Gaussian elimination (Node stdlib only).
  - Baseline: the radar-2 rule, log(TVL) + log(M_cat) from the published
    category table (judgemental entries included).
- Adjustments after the core (radar-2 rules, kept): growth clamp
  [−20, +20] with weight 0.5; maturity 0.6 + 0.4·min(age, 1095)/1095;
  chain 1.00/1.05/1.10/1.15; double-count 0.50 curators/allocators,
  0.75 restaking group; plausibility per the published rule table.
- Effective multiple per row: `M_eff = exp(core) / TVL`, stored as the
  row's `category_multiple`, so the dashboard's replay
  (TVL × M_eff × growth × maturity × chain × double-count × plausibility)
  reproduces the board value exactly — verified 0 mismatches in 200 rows
  (see §6). The ridge already sees log(age) and chain count, so the
  radar-2 maturity/chain steps sit on top of it; the overlap is small
  (ridge raw log-age coefficient 0.012, log-chains 0.123) and disclosed in
  §5. Board: 200 rows (40 watchlist + 160 early), unchanged from radar-2.

## 1. Comparables pool

- 144 protocols have a non-null `mcap_usd`; 16 of those are zero and 12
  have mcap/TVL above 3, so the winsorised pool (mcap > 0, TVL > 0,
  ratio in (0, 3]) is **116 protocols**. Correction to radar-2's
  methodology §2, which said 131: it miscounted the zero-mcap rows.
- Recomputed category medians under the stated rule change two radar-2
  table entries: Yield 0.145 → **0.191** (n=9) and Basis Trading 0.310 →
  **0.482** (n=6); the overall median is 0.177, not 0.169. All other
  table entries reproduce (Lending 0.129 n=13, CDP 0.169 n=3, Dexs 0.293
  n=9, RWA 0.275 n=9, Restaking 0.025 n=2, Payments 0.181 n=2).

## 2. Held-out results — the blend beats both parents on all three tests

| test | split | ridge (λ=100) | radar-2 baseline | blend (w=0.5) |
|---|---|---|---|---|
| 5-fold stratified CV | 116 comps, each held out once; train 90–96/fold | RMSE 1.8398, R² 0.2543 | RMSE 2.0347, R² 0.0879 | **RMSE 1.7810, R² 0.3012** |
| walk-forward 2025-01-01 | train 61 (listed < cut), test 27 (listed ≥ cut) | RMSE 1.7451, R² −0.1605 | RMSE 1.5357, R² 0.1013 | **RMSE 1.4567, R² 0.1914** |
| walk-forward 2025-06-30 | train 72, test 16 | RMSE 1.8845, R² −0.2045 | RMSE 1.8566, R² −0.1690 | **RMSE 1.6105, R² 0.1203** |

Notes on method:

- CV folds are stratified by category: within each category slugs are
  sorted and dealt round-robin with a rotating start fold, so singleton
  categories spread across folds (fold sizes 25/26/22/23/20). No
  randomness, no clock, no network anywhere.
- Walk-forwards split on `listed_at`. The 28 comps with `listed_at =
  null` cannot be placed in time and are excluded from both sides of
  both walk-forwards (61 + 27 = 88 and 72 + 16 = 88, plus 28 = 116).
- The baseline in every run is the radar-2 rule recomputed from the
  training set only (train-only winsorised medians plus the same
  judgemental overrides as the published table: curators/allocators
  0.05, Chain 0.25, Collateral Markets = Restaking median, Staking Pool
  floored at 0.02). It is the model radar-3 replaces, not a straw man.
- Negative R² in the walk-forwards means the test set's own mean
  predicts held-out log(mcap) better than the model does — young
  protocols' market caps are hard to predict from TVL alone, and the
  test sets are small (27 and 16). The ranking between models on the
  same split is still informative, and the blend is the only model with
  positive R² on both walk-forwards.

What the table says:

- **Pure ridge wins the CV but loses both walk-forwards.** Its age and
  chain coefficients are fit mostly on old protocols (train age median
  1,249 days at the 2025-01-01 cut vs 424 in the test set) and
  extrapolate badly to young ones. A model that only wins random folds
  and loses on time is not a model to ship alone.
- **The category median wins neither.** It is the weakest of the three
  on CV and loses both walk-forwards to the blend.
- **The blend wins all three.** It is the only candidate that never
  loses, so it is the final model. The win is modest in absolute terms
  (CV RMSE 1.781 vs 1.840 ridge / 2.035 baseline) — reported as-is,
  not oversold.

## 3. Choosing λ and the blend weight (selection grid)

Grid over λ ∈ {30, 100, 300} × ridge weight w ∈ {0.5, 0.6}, same three
validations. Walk-forward was run for λ ∈ {30, 100}.

CV (balanced folds), blend RMSE:

| λ | w = 0.5 | w = 0.6 |
|---|---|---|
| 30 | 1.8011 | 1.7808 |
| 100 | 1.7810 | 1.7664 |
| 300 | 1.7777 | 1.7754 |

Walk-forward, blend RMSE:

| λ | cut 2025-01-01, w = 0.5 / 0.6 | cut 2025-06-30, w = 0.5 / 0.6 |
|---|---|---|
| 30 | 1.5435 / 1.5953 | 1.6563 / 1.6746 |
| 100 | **1.4567 / 1.4879** | **1.6105 / 1.6249** |

Decision: **λ = 100, w = 0.5**. It wins both walk-forwards outright
and is within 0.006 of the best CV blend (1.7810 vs 1.7754 at λ=300,
w=0.6 — noise at n=116). w = 0.6 wins the CV by ~0.015 but loses both
walk-forwards by ~0.015–0.03, so the extra ridge weight is CV-only
optimism. λ = 100 beats λ = 30 on both walk-forwards by 0.05–0.09.
The choice is the robust one across all three tests, not the best on
any single one.

## 4. Size curve — mcap/TVL falls with size, and the ridge captures it

- OLS slope of log(mcap/TVL) on log(TVL) over the 116 comps: **−0.382**
  — the ratio falls systematically as TVL grows.
- Overall terciles by TVL (median mcap/TVL):
  - $5.0M–$13.0M: **0.404** (n=38)
  - $13.1M–$79.5M: **0.249** (n=38)
  - $79.8M–$26,324M: **0.051** (n=40)
- Per-family terciles (small → mid → large TVL within the family;
  small-n families are noisy, read the overall pattern first):

| family | n | small | mid | large |
|---|---|---|---|---|
| Lending | 13 | 0.218 | 0.087 | 0.129 |
| Dexs | 9 | 0.068 | 1.443 | 0.293 |
| RWA | 9 | 0.870 | 0.205 | 0.082 |
| Yield | 9 | 0.191 | 1.001 | 0.169 |
| Restaking group | 13 | 0.285 | 0.037 | 0.013 |
| Curator / Allocator | 3 | 2.975 | 0.019 | 0.006 |

  RWA and the restaking group decline cleanly with size. Dexs and Yield
  are non-monotonic because their mid bins contain receipt tokens with
  mcap ≈ TVL by construction (sDAI 1.001, looped-hype 1.000, sushiswap
  1.524) — the ratio there measures token design, not size. The
  Curator/Allocator row is three protocols: api3 (2.975, an oracle,
  rejected as a comp) and grove/concrete (0.006/0.019).
- Fitted elasticity d log(mcap)/d log(TVL) from the full ridge fit
  (raw log-TVL slope 0.264, quadratic 0.039): 0.101 at $5M TVL, 0.282 at
  $50M, 0.463 at $500M, 0.643 at $5B. Elasticity is below 1 throughout
  — the ratio falls with size at every scale, just less steeply for the
  largest protocols.
- Quadratic ablation (CV, λ=100): with the (log TVL)² term RMSE 1.8398,
  without it 1.8626. At the chosen λ the quadratic helps slightly; at
  λ=30 it hurt slightly (1.8151 vs 1.8062 in exploration). Either way
  its contribution is small — the size curve lives mainly in the
  log-TVL slope being well below 1, and the quadratic is kept because
  the curve it fits is real (slope −0.382, terciles 0.404 → 0.249 →
  0.051), not because it wins a horse race.

## 5. Full-fit ridge coefficients (λ=100, n=116)

Standardised intercept 15.899. Raw slopes: log TVL 0.264, (log TVL)²
0.039, log age **0.012**, log(1+chains) **0.123**. Category dummies
(standardised, categories with ≥3 comps): Basis Trading +0.049, Bridge
+0.008, CDP −0.020, CEX +0.053, Canonical Bridge +0.052, Cross Chain
Bridge +0.010, Dexs −0.003, Indexes +0.009, Lending −0.104, Liquid
Staking −0.047, Privacy +0.055, RWA +0.056, Yield −0.041, Yield
Aggregator −0.036.

Two readings that matter for the board:

- **Age almost does not matter** once TVL and category are in: a raw
  log-age slope of 0.012 moves value by ~±1% across the observed age
  range. The radar-2 maturity step (0.60–1.00x) is therefore doing
  almost all of the age work in the final board, and the ridge's age
  term double-counts it by ~1% at most. Kept, and disclosed here,
  because the dashboard sandbox replays the maturity step.
- **Chains matter modestly**: raw slope 0.123 on log(1+chains). The
  ridge's chain contribution and the 1.00–1.15x step together give a
  combined chain effect of about 0.95x (1 chain) to ~1.28x (23 chains).
  That is the known overlap from keeping the dashboard replay exact;
  the alternative (dropping the step) would break the dashboard's
  per-row recomputation, which currently reproduces all 200 board
  values exactly (§6).

## 6. Board-level checks (local run, 2026-11-18)

- `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input
  ../token-radar-01-kit/input/snapshot.json`, run twice: **byte-identical
  output** (`diff -r` clean). Deterministic: no clock, no randomness,
  no network in the model.
- `boardIssue` is null (main.ts refuses a board it is not null for).
  Board: 200 rows, 40/40 watchlist, 160 early, ranks 1–200, implied
  values strictly non-increasing, 6 farm steps per row, all steps
  20–600 chars.
- Dashboard replay check (the dashboard's own `scoreRow` arithmetic,
  run against `out/board.json`): **0 mismatches in 200 rows** — every
  row's TVL × effective multiple × growth × maturity × chain ×
  double-count × plausibility equals its board value.
- `scripts/gate-check.mjs`: 19/20 PASS. The one FAIL is the gate's own
  hardcoded check `model radar-2` — the gate script was written for
  v1 and asserts `model_version === 'radar-2'`; the data.js rows agree
  with board.json, only the version string is now `radar-3`. The gate
  script needs its version string updated by the integrator; it is not
  a model file and was not edited here.

## 7. What radar-3 changes on the board (vs radar-2)

Watchlist implied sum: **$303.4M** (radar-2: $533.1M). The blend pulls
large rows toward the ridge, and the ridge's size curve (elasticity
< 1) values big TVL at a lower multiple than a flat category median —
that is the model's main correction, and it is the direction the
validation supports.

Top 10, radar-3 (radar-2 in brackets):

| rank | protocol | radar-3 | radar-2 |
|---|---|---|---|
| 1 | opentrade | $25.24M | $59.38M (#2) |
| 2 | onre | $25.04M | $66.14M (#1) |
| 3 | veda | $23.05M | $35.80M (#4) |
| 4 | steakhouse-financial | $17.63M | $31.26M (#5) |
| 5 | r25 | $16.97M | $38.56M (#3) |
| 6 | lofty | $14.97M | $27.82M (#7) |
| 7 | gauntlet | $11.99M | $18.62M (#10) |
| 8 | ember | $11.95M | $19.93M (#8) |
| 9 | saturn | $11.40M | — (outside radar-2 top 10) |
| 10 | upshift | $11.05M | — (outside radar-2 top 10) |

RWA still leads (OpenTrade, OnRe) but at roughly 40% of its radar-2
values; the ordering inside the top 10 is stable (same names, shuffled
by the size curve). USDD falls out of the top 10 on the blend ($10.69M,
rank 12) because the ridge values a $1,056M-TVL CDP at a much lower
multiple than the category median does.

Plausibility changes from the 2026-11-18 verification research
(`token-radar-02-research.md`):

- **Lagoon 1.00 → 0.50** (no Lagoon points program found; ERC-7540
  vault factory, not a points issuer). Radar-3 implied **$2.28M**
  (rank 127). The research's radar-2-arithmetic estimate was $1.82M;
  the difference is the blend's higher effective multiple for Lagoon
  (0.0625 vs the 0.05 category anchor), not a different verdict.
- **Upshift stays 1.00** — Season 2 points verified live (5x boost
  until $750M TVL; $515M on 2026-10-12), with the honest note that
  official docs promise no token. Radar-3 implied $11.05M (rank 10).
- **MEZO stays 0.20**, evidence strengthened (trades ~$1.5M mcap,
  2026-11-18, Coinbase/Gate/MEXC; −98% from Apr 2026 ATH). Farm plan
  rewritten: Mezo Earn is marked "coming soon" and native BTC bridge-in
  closed 13 Oct 2026; the live path is MUSD Savings Vault / gauges /
  veMEZO via EVM + tBTC. Radar-3 implied $0.95M (rank 167).
- **Veda stays 1.00** with a downgraded confidence note: the points
  formula (USD × 0.01 × days) is verified, but no Veda-run season was
  confirmed open as of 2026-11-13; live incentives sit with the vault
  brands (e.g. ether.fi). Radar-3 implied $23.05M (rank 3).
- **Symbiotic stays 1.00** with the note added: no confirmed named
  campaign, no token promise, TVL −41% (2 Oct → 7 Nov 2026).
- USDD/TAO/PLUME 0.20 re-verified with 2026-11-18 market values
  (USDD ~$1.44B, TAO ~$2.3B, PLUME ~$80M); Plume's claim window closed
  Aug 2026, noted on the row.

Odd slugs — all three stay on the board, per the research verdicts:

- **shift-defi** (rank 43, $4.82M): the +4,448% week is adapter
  onboarding of institutional PYUSD/RLUSD vaults on 8 Nov 2026 (TVL
  $1.0M → $31.6M in a day), not a data error. Left on the board; the
  growth clamp bounds it to +20% (+10% of value); its farm plan carries
  the data note in-row.
- **current** (rank 70, $3.86M): real Sui lender (isolated markets,
  Multiply leverage, points program listed in Oct 2026 comparisons;
  backed by Sui Foundation, OKX Ventures, Cetus, Bluefin). Normal
  below-floor candidate; Lending multiple applies.
- **project-0** (rank 64, $3.98M): the former MarginFi, no token, real
  prime-broker thesis — with the in-row note that TVL is ~96% below its
  2024 peak above $800M.

Farm plans (10 curator rows, per the research §4): 8 rewritten to
specific paths with venues, chains, APYs and fees — Nonce (ether.fi
Liquid on Veda, bunker mode since early Oct 2026), K3 (k3-capital.net
vaults, sBOLD → Liquity v2, ~10% performance fee), Clearstar (Morpho
cbAssets 6.69% / USDC Reactor 6.89% net), RockawayX (Morpho USDC Prime
rxUSDCp / Kamino RWA USDC 4.8%), Hyperithm (Kamino Apex 6.77% /
Morpho USDC 10.54% / Monad aHYPER looping only if understood),
Gami (Upshift vaults, Upshift points 1x/5x), Galaxy (Morpho Quality vs
Enhanced; Fireblocks is institutional-only), Armitage (Morpho USDC
Prime/Select; Railnet WETH Yield watch-only until launch). **Keyrock
and Tulipa are watch-only**: no retail farm exists (Keyrock: $1.1B
market maker, no retail product; Tulipa: mandate-only boutique, no
self-serve deposits) — their plans say so and watch quarterly instead
of inventing tasks. Gauntlet's plan now starts with the new risk:
**V1 vaults partly closed since 5 Nov 2026, no reopening date** —
check a vault is open before depositing.

## 8. Limitations (honest gaps)

- Absolute accuracy is poor (log-RMSE ~1.8): the board ranks
  protocols, it does not price them. No row should be read as a
  valuation.
- The walk-forward test sets are small (27 and 16) and R² is negative
  for the parents; the blend's edge there is real but not large.
- The ridge is fit on 116 comps across 31 categories; most categories
  have under 10 comps, so category dummies are heavily shrunk (λ=100)
  and the blend leans on the category median for thin categories.
- Upshift's 5x boost status was last fully re-checked 2026-10-12
  (TVL $515M/$750M); the farm plan tells the farmer to re-confirm in
  the app. Lagoon's "no points" is a negative conclusion from the
  places checked, listed in the research report — it cannot exclude a
  points entry hidden on some vault page.
- APYs and gas figures in farm plans are 2026-11-18 estimates from the
  research report, not live quotes; plans say so where the research
  says so.
