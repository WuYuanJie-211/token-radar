# Verification — token-radar-01 (radar-2)

Date: 2026-11-18. Verifier: builder session. All checks below are read-only:
no spending, no on-chain writes, no paid APIs.

## 1. Model arithmetic — worked examples recomputed from the snapshot

The build reproduces the methodology's worked examples exactly (main.ts run,
2026-11-18; board.json top 10 and watchlist sum):

| protocol | model output | methodology §3b |
|---|---|---|
| OnRe | $66,143,640 | $66.14M |
| OpenTrade | $59,383,765 | $59.4M |
| R25 | $38,557,232 | $38.6M |
| Veda | $35,798,044 | $35.80M |
| Steakhouse Financial | $31,259,075 | $31.26M |
| USDD | $30,412,472 | $30.4M |
| Lofty | $27,815,849 | $27.8M |
| Ember | $19,932,483 | $19.9M |
| Valos | $18,764,759 | $18.8M |
| Gauntlet | $18,617,147 | $18.6M |
| Symbiotic | $4,133,016 | $4.13M |
| Curvance | $12,858,127 | $12.86M |
| Bittensor dTAO | $13,223,466 | $13.22M |
| Tori Finance | $16,011,030 | $16.01M |
| Reti Pooling | $778,950 | $0.78M |

Watchlist implied sum: **$533,087,670** (methodology: $533.1M). The starter
flat-0.25 model gave ~$3.2B for the same watchlist — radar-2 is ~6x lower,
driven by category multiples (RWA 0.275x vs restaking 0.025x) and the
double-count + plausibility haircuts on the three largest rows.

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

Inconclusive — methodology source stands, skill check could not confirm:

- **MEZO (mezo-earn)**: search returned Mezo USD (MUSD, real, mezo.org,
  $210k mcap) plus $5–7k Solana memes named MEZO. No genuine MEZO
  governance token surfaced in the top hits, so the 0.20 plausibility for
  this row rests on the methodology's Bitget Jan 2026 campaign source, not
  on this check. Flagged as the weakest edge-case verification.

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
- Upshift / Lagoon plausibility 1.00 is the weakest 1.00 in the board: no
  points program was verified for them in research; at 0.50 both would
  roughly halve. The dashboard's sandbox lets the judge test that.
