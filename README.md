[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/WuYuanJie-211/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/WuYuanJie-211/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar — pre-token protocols ranked by implied value

Token Radar scores every pre-token protocol in the DefiLlama snapshot
(2026-11-14, 758 protocols) and ranks the 40-protocol watchlist plus 160
early pre-token rows below the $50M floor by **implied circulating market
cap** — the value a protocol would carry if it traded today at its
category's median market-cap-to-TVL ratio.

The model is **radar-2**: category multiples from the snapshot's own
live-token comparables (RWA 0.275x, Dexs 0.293x, Lending 0.129x, restaking
0.025x), a tight 7-day growth clamp [-20, +20], a maturity curve, a chain
breadth factor, double-count haircuts (0.50x curators/allocators, 0.75x the
restaking group), and published plausibility rules (0.50x private curator
firms, 0.20x where a token already trades — USDD, dTAO, Plume Vaults,
Mezo Earn — 0.10x Lightning Network, which has no token thesis). Watchlist
implied sum: **$533M**. Every row carries all factors, a p25/p75 range
where its category has 4+ comps, an FDV range (implied x [2, 4], secondary
only), and a six-step farm plan with costs and times. Where no live program
exists — Plume Points Season 2 closed, a token already trades, or there is
no token thesis — the plan says so instead of inventing tasks.

The dashboard is static and offline: a sortable/filterable board, a detail
view per protocol (factors, working, comparables, farm plan), a model
sandbox bound to the category table, and a separate live-token view. No
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
- `lib/model.ts` — the radar-2 model, the board builder and the farm plans
- `dashboard/` — `index.html` + `app.css` + `app.js` (static, offline)
- `screenshots/` — board, detail, filtered views of the dashboard
- `docs/verification.md` — what was verified, with dates and sources
- `vendor/makefun-board.ts` — make.fun's dossier library (verbatim)
- `scripts/gate-check.mjs` — local gate mirror

Referral code: `yscmfwa4` (https://make.fun/r/yscmfwa4)
