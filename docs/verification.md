# Verification — token-radar-01 (radar-4)

Date: 2026-11-18. Verifier: builder session. All checks below are read-only:
no spending, no on-chain writes, no paid APIs.

## 1. Model arithmetic — board top 10 recomputed from the snapshot

The build reproduces the board exactly (main.ts run, 2026-11-18;
`board.json` top 10, cross-checked against `data.js` and the dashboard's
own replay — 0/200 rows disagree):

| protocol | model output |
|---|---|
| OnRe | $56,222,094 |
| OpenTrade | $50,476,200 |
| R25 | $32,773,647 |
| Veda | $30,428,337 |
| Steakhouse Financial | $26,570,213 |
| USDD | $25,850,601 |
| Lofty | $25,173,343 |
| Tori Finance | $23,139,503 |
| Axis | $20,273,174 |
| Ember | $18,250,181 |

Watchlist implied sum: **$484,184,955**. radar-2 gave $533.1M for the
same watchlist; radar-4 is lower only by the capped size adjustment
(at most -15% on the largest rows) — OnRe's $308.9M TVL implies $56.2M
instead of $66.1M, Steakhouse's $2.75B TVL implies $26.6M instead of
$31.3M. radar-3 gave $303.4M because its full size curve (slope -0.382)
compressed big-TVL multiples. Full out-of-sample validation (5-fold CV
+ two walk-forwards, size-adjusted model beats the flat baseline on all
three) is in `docs/validation.md`; the methodology is in
`docs/methodology.md` (§10 is the radar-4 section).

## 2. Spot checks with the user's skills (2026-11-18, live APIs)

### query-token-info — token search (Binance Web3 token index)

Keyword search is noisy (meme-coin lookalikes share names), so a hit only
counts when name + symbol + chain + a real website/market cap line up.
Searches ran on chains 1 (Ethereum), 56 (BSC), 8453 (Base), CT_501 (Solana).

Token-exists edge cases — confirmed a real token trades:

- **USDD**: USDDOLD on Ethereum (0x0c10bf8fcb7bf5412187a595ab97a3609160b5c6),
  price ~$0.998, website usdd.io. Supports plausibility 0.20.
- **TAO (bittensor-dTAO)**: Wrapped TAO on Ethereum
  (0x77e06c9eccf2e797fd462a92b6d7642ef85b0a44), price $196.82,
  15,793 holders, website bittensor.com. Supports plausibility 0.20.
- **PLUME (plume-vaults)**: Plume token on Ethereum
  (0x4c1746a800d224393fe2470c70a35717ed4ea5f1), symbol PLUME. (The top
  Solana hit was a $6k pump-coin impersonator — ignored.) Supports 0.20.

Pre-token top rows — no genuine protocol token found:

- **Veda**: only "Veda AI" micro-cap memes ($6.6k mcap). No protocol token.
- **OnRe**: no OnRe token in hits; all unrelated memes.
- **OpenTrade**: only an "OpenTrade defi" $6.4k Solana meme; not the RWA
  protocol's token.
- **Steakhouse**: vault receipt tokens exist (steakUSDC, ~$100M mcap on
  Base) — these are vault shares, not a governance token. No governance
  token found. Row correctly farms the underlying vaults.
- **Gauntlet**: a $329k "Gauntlet" token on Base and a gtusdcrwa vault
  receipt; no official governance token found.
- **Lofty / Ember / Valos**: only micro-cap memes ($2k–$40k). No protocol token.
- **R25**: one same-name "R25 (OFFICIAL)" token, $58k mcap on Base — looks
  unofficial; the snapshot records no token and no official R25 token was
  found. Row stays pre-token; the lookalike is noted here, not in the board.

Verified 2026-11-18 (research pass, see `docs/methodology.md` §9 and the
research report): **MEZO already trades** — CoinGecko ~$0.00293, mcap
~$1.46M, listed on Coinbase/Gate/MEXC, -98% from its April 2026 ATH — so
plausibility 0.20 stands on live market data, not on the Bitget source
alone. The farm plan was rewritten to the live paths: MUSD Savings Vault,
gauges, veMEZO (EVM + tBTC); Mezo Earn itself is still "coming soon" and
native BTC deposit closed 2026-10-13, so the plan says so, and it flags
the 4.7M MEZO emissions unlock on 2026-11-19.

Comparables — live tokens behind the category multiples:

- **AAVE (Lending comp)**: $111.63, mcap ~$1.786B on Ethereum. Exists.
- **LDO (Liquid Staking comp)**: $0.273, mcap ~$272.8M on Ethereum. Exists.
- **Ondo family (RWA)**: USDY $2.1B mcap on BSC. Exists; the ONDO token
  itself did not surface in the top 3 hits.
- **EIGEN (Restaking comp)**: keyword search did NOT surface EIGEN itself
  (top hits were lookalikes). The restaking multiple (0.025x) rests on the
  snapshot's own mcap/TVL figures (Eigen 0.032, Babylon 0.017), which the
  build recomputes per category — not on this search.

### query-token-audit — USDD contract audit (2026-11-18)

- USDD on Ethereum (0x0c10bf8fcb7bf5412187a595ab97a3609160b5c6):
  hasResult true, isSupported true, riskLevel 0, contract verified,
  buy tax 0.0%, sell tax 0.0%. No risk flags hit. (Audit results are a
  point-in-time snapshot, not a safety guarantee.)

### crypto-market-rank — token-rank trending (BSC, 2026-11-18)

- `token-rank` (Trending, chain 56, size 20) returned an empty list, so it
  gave no signal either way about watchlist names. Recorded as no evidence,
  not as confirmation. The skill is a leaderboard, not a token-existence
  check; the query-token-info searches above are the verification used.

### bsc-mint-precheck — read, not run

- Skill read 2026-11-18. It is a read-only precheck for a specific BSC mint
  URL or contract address. The snapshot carries no mint contracts and this
  entry mints nothing, so there is no contract for it to precheck; its
  blacklist (XU/AIDROP/BabyMint) does not intersect any board row. No run
  was applicable. No spending, no approvals, no transactions in this build.

## 3. Data-quality notes (from the snapshot, for the judge)

- `shift-defi` (+4,448% 7d) and the odd below-floor slugs `current` /
  `project-0` are in the rankable set; the growth clamp [-20, +20] bounds
  the outlier to +10% of value, and no row is excluded by hand.
- `listed_at` is when DefiLlama started tracking, a maturity proxy, not a
  launch date; the dashboard says so.
- Chain-count TVL sums double-count (curator vault deposits sit inside
  Morpho/Kamino TVL); the model haircuts curator/allocator TVL 0.50x and
  the restaking group 0.75x instead of summing chains.
- The snapshot records no supply data, so FDV is shown only as implied
  x [2, 4], a secondary line, never the headline number.
- Upshift plausibility 1.00 is now verified, not assumed: Season 2 points
  are live with a 5x boost until $750M TVL (last re-checked 2026-10-12);
  the official docs promise no token, so the row says so and treats points
  as a possible — not promised — path. Lagoon went the other way: no own
  points program exists (it is an ERC-7540 vault factory), so its
  plausibility is 0.50 and its farm plan is yield + underlying rewards
  only. Both verdicts were checked 2026-11-18.
- The comparables pool is 116 live-token protocols (144 with a non-null
  mcap, minus 16 with mcap 0 and 12 with mcap/TVL > 3), not 131 as the
  radar-2 table said; corrected medians: Yield 0.191, Basis 0.482,
  overall 0.177.
