# Synthetic worked example

Every name and figure on this page comes from `examples/synthetic-snapshot.json`. That file is invented. It is not a DefiLlama snapshot, and these figures are not market data.

The run was Node `v22.23.4`:

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input examples/synthetic-snapshot.json
```

A second run to another directory was byte-identical. `node scripts/gate-check.mjs out examples/synthetic-snapshot.json` printed `gate-check: ALL PASS`.

The program printed `125 rows scored (70 early, 24 live set aside)` and a watchlist implied sum of `$49,575,385`. The board sum in `data.js` was `$192,381,058`. The fit pool had 30 protocols (the fixture's outlier, market cap / TVL = 4, is outside the pool). Rounded Huber fit: intercept `0.0016`, slope `0.8948`, R² `0.3516`.

## One row

Rank 1 was `proto-watch-01` (“Proto Watch 1”), category RWA, chain Ethereum, TVL `$91,000,000`, 7-day change `-8`, `listed_at` null. The scorer stored:

| Factor | Stored value |
| --- | --- |
| Age used | 512 days, because `listed_at` is null |
| Family offset | RWA `+0.0367` |
| Momentum | `0.98` = `1 + 0.25 * (-8) / 100` |
| Double-count | `1` |
| Plausibility | `1` |
| Launch odds | `0.3333` — the output says 11 of 33 protocols listed 512 days or longer record a token |
| Value if it launches | `$14,166,948` |
| Implied value | `$4,721,844` |
| Band P10, P25, P75, P90 | `$1,439,290`, `$2,526,752`, `$8,823,903`, `$15,490,842` |

Replay from the stored rounded fit, which matches the row:

```text
log10(91,000,000) = 7.9590
10^(0.0016 + 0.8948*7.9590 + 0.0367 + log10(0.98)) = 14,166,948
14,166,948 * 1 * 1 = 14,166,948
round(14,166,948 * 0.3333) = 4,721,844
```

Farm money line stored for the default `$1,000` deposit, 10% drop share and 4% forgone yield: hold 30 days, gas `$8` because the chain is Ethereum, fees `$18`, slice `$15.57`, expected slice `$5.19`, forgone `$3.29`, net `-$16.10`, break-even odds `1.3674`, verdict `SKIP`, six generic steps. The slug is not one of the hand-written farm slugs.

## Held-out numbers on this fixture only

`validation.conclusion` in the output begins “The fitted curve beats the flat baseline on all three held-out tests” and then prints:

| Split | Curve median miss | Flat baseline |
| --- | --- | --- |
| Leave-one-out (n=30) | 1.85x (within 3x: 77%) | 1.71x (within 3x: 70%) |
| Walk-forward 2025-01-01 (n test=20) | 2.68x | 1.61x |
| Walk-forward 2025-06-30 (n test=10) | 2.11x | 1.61x |

On this invented input the curve's median miss is larger than the baseline's on each split. The word “beats” in that generated sentence does not match these multiples. Family offsets and the momentum carry are whatever the fixture produced; they are not the offsets named in the radar-5 source comments.

Do not carry this table across to the external snapshot. That file is not here, so those coefficients and misses were not rerun.

Opening `out/dashboard/` from a static server on that output shows Proto Watch 1 at the top, model `radar-5`, and the multiples above. The same page still prints “DefiLlama protocol index” and a ledger line that starts `758 =`, because those words are fixed in `dashboard/app.js`. On this fixture the counts after that prefix are 125 ranked, 31 traded and 3 set aside. The page was not edited.
