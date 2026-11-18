[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/WuYuanJie-211/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/WuYuanJie-211/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar — pre-token protocols ranked by implied value

Token Radar scores every pre-token protocol in the DefiLlama snapshot
(2026-11-14, 758 protocols) and ranks the 40-protocol watchlist plus 160
early pre-token rows below the $50M floor by **implied circulating market
cap** — the value a protocol would carry if it traded today at its
category's median market-cap-to-TVL ratio.

The model is **radar-4**: the radar-2 category-median multiple
(winsorised medians over the snapshot's own live-token comparables)
times one visible, capped size adjustment (slope −0.10 on log TVL,
at most ±15% — the fitted slope is −0.382, but the full slope is what
flattened radar-3's board head to a $25M top 1). The adjustment beats
the flat baseline on all three held-out tests (5-fold stratified CV
log-RMSE 1.996, R² 0.122 vs baseline 2.035/0.088; walk-forward to
2025-01-01 1.489/0.155 vs 1.536/0.101; walk-forward to 2025-06-30
1.801/−0.101 vs 1.857/−0.169; full tables in `docs/validation.md`).
On top of the core sit a tight 7-day growth clamp [-20, +20], a
maturity curve, a chain breadth factor, double-count haircuts (0.50x
curators/allocators, 0.75x the restaking group), and published
plausibility rules (0.50x private curator firms, 0.20x where a token
already trades — USDD, dTAO, Plume Vaults, Mezo Earn — 0.10x Lightning
Network, which has no token thesis). Watchlist implied sum: **$484.2M**
(radar-2 $533.1M, radar-3 $303.4M); top 1 OnRe $56.2M, top 10 $309.2M.
Every row carries all factors, a p25/p75 range, a rank range computed
from that range, an FDV range (implied x [2, 4], secondary only),
one-per-ticker comparables, and a six-step farm plan with costs, times,
a signal line and a money line (deposit, gas, expected yield, net after
gas, points counted as $0). Where no live program exists — Plume Points
Season 2 closed, a token already trades, or there is no token thesis —
the plan says so instead of inventing tasks.

The dashboard is static and offline: a sortable/filterable board, a detail
view per protocol (working, comparables, farm plan), and a separate live-token view. No
network calls, no images, no framework.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Node 22, standard library only. The program runs twice with byte-identical
output (no clock, no randomness, no network). `node scripts/gate-check.mjs`
mirrors the sealed gate locally (dashboard, board, screenshots, dossier,
data agreement).

## Layout

- `main.ts` — entry point: reads the snapshot, writes `board.json`,
  `data.js`, `dashboard/`, `screenshots/`, `dossier.json`
- `lib/model.ts` — the radar-4 model, the board builder and the farm plans
- `dashboard/` — `index.html` + `app.css` + `app.js` (static, offline)
- `screenshots/` — board, detail, filtered views of the dashboard
- `docs/verification.md` — what was verified, with dates and sources
- `docs/methodology.md` — the full methodology (snapshot stats, model, farm rules)
- `docs/validation.md` — radar-4 out-of-sample validation (CV, walk-forward, size curve, rank ranges)
- `vendor/makefun-board.ts` — make.fun's dossier library (verbatim)
- `scripts/gate-check.mjs` — local gate mirror

Referral code: `yscmfwa4` (https://make.fun/r/yscmfwa4)
