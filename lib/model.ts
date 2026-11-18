// Token Radar, model radar-3.
//
// One snapshot of the protocol universe in, one ranked board out. The board
// covers every slug in the snapshot's watchlist (the floor, never a ceiling)
// and adds pre-token protocols below the watchlist floor, by TVL. A protocol
// records no token when its index entry has no market cap, no CoinGecko id
// and no symbol; live-token protocols are kept apart and shown with the
// market's own values, never mixed into the ranked board.
//
// Implied value is an implied circulating market cap, not a price and not a
// promise of a token. radar-3 replaces radar-2's single category multiple
// with a blend, fit on the snapshot's own live-token comparables and chosen
// by out-of-sample validation (see `validateModel` and
// token-radar-02-validation.md):
//
//   core      = exp(0.5 * ridge + 0.5 * baseline), in log space, where
//     ridge    = ridge regression of log(mcap) on log(TVL), (log TVL)^2
//                (the size curve), log(age), log(1 + chains) and category
//                dummies (categories with >= 3 comps), lambda = 100,
//                features standardised, intercept unpenalised;
//     baseline = log(TVL) + log(M_cat), the radar-2 category multiple.
//   M_eff     = core / TVL, the row's effective multiple. The dashboard
//                replays the board as TVL x M_eff x growth x maturity x
//                chain x double-count x plausibility, so the row stores
//                exactly that product: the ridge already sees log(age) and
//                chain count, and the radar-2 maturity/chain step
//                adjustments are kept on top for replayability. The overlap
//                is small and disclosed in the methodology: the ridge's raw
//                log-age coefficient is 0.012 (maturity overlap ~+/-1%),
//                its raw log-chains coefficient is 0.123, so the combined
//                chain effect runs 0.95x (1 chain) to ~1.28x (23 chains)
//                instead of the step alone (1.00x-1.15x).
//   growth    = clamp(change_7d, -20, +20); a 7-day window is mostly price
//                movement, so it may move value by at most +/-10%.
//   maturity  = 0.6 + 0.4 * min(age_days, 1095) / 1095; age unknown -> 512d,
//                the median listed age in the snapshot (radar-2 rule, kept).
//   chain     = 1.00 (1 chain) / 1.05 (2-3) / 1.10 (4-9) / 1.15 (10+)
//                (radar-2 rule, kept).
//   dblcount  = 0.50 for Risk Curators and Onchain Capital Allocators
//                (their TVL is deposits already counted inside Morpho,
//                Kamino and the like), 0.75 for Restaking, Collateral
//                Markets and Staking Pools (restaked assets counted twice),
//                1.00 otherwise (radar-2 rule, kept).
//   plaus     = 1.00 by default; 0.50 for private curator firms with no
//                points program and no public token path, and for Lagoon
//                (no points program found on 2026-11-18: it is an ERC-7540
//                vault factory, not a points issuer); 0.20 where a token
//                already trades for the same entity, or for a chain whose
//                token thesis is weak; 0.10 where there is no token thesis
//                at all. Upshift keeps 1.00: its Season 2 points program
//                was verified (5x boost until $750M TVL), though its docs
//                promise no token. The rule table is published in the
//                dashboard and in PLAUSIBILITY_RULES below.
//   implied   = max(1, round(TVL * M_eff * growthMult * maturity
//                      * chain * dblcount * plaus))
//
// The fully-diluted range shown beside each row is implied * [2, 4]: the
// snapshot carries no supply data, so no FDV multiple can be measured from
// it, and the range is a secondary line only, never the headline number.
// The p25/p75 range is the same computation with the category's p25/p75
// mcap/TVL in place of its median in the baseline half of the blend, shown
// only where the category has at least four live-token comps.
//
// Validation decided the blend. On the snapshot's 116 winsorised
// live-token comps (mcap > 0, TVL > 0, mcap/TVL in (0, 3]): 5-fold
// stratified CV gives the blend RMSE 1.781 (R2 0.301) against ridge 1.840
// (0.254) and the radar-2 baseline 2.035 (0.088); walk-forward to
// 2025-01-01 gives blend 1.457 (0.191) against ridge 1.745 (-0.161) and
// baseline 1.536 (0.101); walk-forward to 2025-06-30 gives blend 1.611
// (0.120) against ridge 1.885 (-0.205) and baseline 1.857 (-0.169). The
// blend beats both parents on all three held-out tests, so it is the
// model. Pure ridge wins the CV but loses both walk-forwards (its age and
// chain coefficients, fit on old protocols, extrapolate badly to young
// ones); the category median wins neither. All errors are log-scale RMSE
// on held-out log(mcap). `validateModel` recomputes every number from the
// snapshot at build time; nothing here is hand-copied.
//
// Corrections to radar-2's tables, recomputed from the snapshot under the
// stated winsorised rule: the comparables pool is 116 protocols, not 131
// (144 have a non-null mcap, but 16 of those are zero and 12 have a ratio
// above 3); Yield's median is 0.191 (n=9), not 0.145, and Basis Trading's
// is 0.482 (n=6), not 0.310; the overall median is 0.177, not 0.169.
//
// One function scores every row. The category table, the double-count
// table and the plausibility rules are data the function reads, not
// branches written per protocol: no row is hand-picked and no protocol
// name changes the arithmetic except through the published rule tables.
// Farm plans are the exception and are labelled as such: they are
// per-protocol instructions built from the 2026-11-18 verification
// research, and a row with no retail farm says so instead of inventing
// tasks.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One row of the category-multiple table: the multiple, how it was set, and how much to trust it. */
export interface CategoryMultiple {
  multiple: number;
  basis: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Category multiples M_cat, the baseline half of the radar-3 blend.
 * Winsorised medians are recomputed from the snapshot's own live-token
 * comps (mcap > 0, TVL > 0, mcap/TVL in (0, 3]); the judgemental entries
 * are the methodology's disclosed calls: the Risk Curators comp (api3, an
 * oracle, ratio 2.975) is rejected, the Onchain Capital Allocator raw
 * median (0.013, n=2: grove 0.006, concrete 0.019) is rejected as too low
 * for a fee token, the Staking Pool raw median (0.002) is floored at
 * 0.020, and the Chain sole comp (astar, 3.026) is rejected because it
 * falls outside the winsorised range. Categories with no comps at all fall
 * back to the overall winsorised median, 0.177.
 */
export const CATEGORY_MULTIPLES: Record<string, CategoryMultiple> = {
  'Lending': { multiple: 0.129, basis: 'winsorised median, n=13 live comps', confidence: 'high' },
  'CDP': { multiple: 0.169, basis: 'winsorised median, n=3 live comps', confidence: 'medium' },
  'Dexs': { multiple: 0.293, basis: 'winsorised median, n=9 live comps', confidence: 'high' },
  'Yield': { multiple: 0.191, basis: 'winsorised median, n=9 live comps', confidence: 'medium' },
  'RWA': { multiple: 0.275, basis: 'winsorised median, n=9 live comps', confidence: 'high' },
  'Restaking': { multiple: 0.025, basis: 'winsorised median, n=2 live comps (Eigen 0.032, Babylon 0.017)', confidence: 'medium' },
  'Collateral Markets': { multiple: 0.025, basis: 'restaking group median; no direct comps', confidence: 'low' },
  'Staking Pool': { multiple: 0.02, basis: 'raw median 0.002 floored at 0.020 (judgemental)', confidence: 'low' },
  'Basis Trading': { multiple: 0.482, basis: 'winsorised median, n=6 live comps', confidence: 'high' },
  'Payments': { multiple: 0.181, basis: 'winsorised median, n=2 live comps', confidence: 'medium' },
  'Risk Curators': { multiple: 0.05, basis: 'judgemental; sole comp api3 (2.975, an oracle) rejected', confidence: 'low' },
  'Onchain Capital Allocator': { multiple: 0.05, basis: 'judgemental; raw median 0.013 (n=2) rejected as too low for a fee token', confidence: 'low' },
  'Chain': { multiple: 0.25, basis: 'judgemental; sole comp astar (3.026) rejected (outside winsorised range)', confidence: 'low' },
  'CeDeFi': { multiple: 0.177, basis: 'overall median fallback; no comps', confidence: 'low' },
  'Insurance': { multiple: 0.177, basis: 'overall median fallback; no comps', confidence: 'low' },
  'Governance Incentives': { multiple: 0.177, basis: 'overall median fallback; no comps', confidence: 'low' },
  'Stablecoin Wrapper': { multiple: 0.177, basis: 'overall median fallback; no comps', confidence: 'low' },
};

/** The fallback for a category the table does not list: the overall winsorised median. */
export const FALLBACK_MULTIPLE: CategoryMultiple = {
  multiple: 0.177,
  basis: 'overall median fallback; category not in the table',
  confidence: 'low',
};

/** Double-count haircuts on TVL, by category. */
export const DOUBLE_COUNT: Record<string, number> = {
  'Risk Curators': 0.5,
  'Onchain Capital Allocator': 0.5,
  'Restaking': 0.75,
  'Collateral Markets': 0.75,
  'Staking Pool': 0.75,
};

/** The ridge penalty (lambda) and the ridge weight in the log-space blend, chosen by validation. */
export const RIDGE_LAMBDA = 100;
export const RIDGE_WEIGHT = 0.5;

/**
 * Plausibility rules, in the order they are applied (first match wins).
 * Each rule is a verifiable fact, not a judgement of quality:
 *  - token-exists: a token already trades for the same entity, so there is
 *    no new launch to value (USDD ~$1.44B mcap; TAO ~$2.3B; PLUME ~$80M,
 *    TGE Jan 2025; MEZO ~$1.5M, on Coinbase/Gate/MEXC — all 2026-11-18).
 *  - no-thesis: the Lightning Network is a Bitcoin payment network with no
 *    token and no token thesis.
 *  - chain-weak: chain tokens for appchains with a weak token thesis.
 *  - no-points allocator: Lagoon has no points program of its own (checked
 *    2026-11-18: lagoon.finance blog/docs, web search) — it is an ERC-7540
 *    vault factory, not a points issuer — and no public token path.
 *  - curator-private: private curator firms with no points program and no
 *    public token path found in research.
 * Anything else scores 1.00: a public deposit product with a plausible
 * token path. Upshift's 1.00 is verified, not assumed: its Season 2 points
 * program is live (5x boost until $750M TVL), though its docs promise no
 * token. The rules are published in the dashboard's model section.
 */
export const PLAUSIBILITY_RULES: { factor: number; reason: string }[] = [
  { factor: 0.2, reason: 'a token already trades for this entity, so there is no new launch to value' },
  { factor: 0.1, reason: 'no token and no token thesis (a payment network, not a token launch)' },
  { factor: 0.2, reason: 'chain-token thesis is weak for this appchain' },
  { factor: 0.5, reason: 'no points program found and no public token path (vault infrastructure, not a points issuer)' },
  { factor: 0.5, reason: 'private curator firm; no points program and no public token path found' },
];

/** Slugs where a token already trades for the same entity (plausibility 0.20). Market values are 2026-11-18. */
export const TOKEN_EXISTS_SLUGS: Record<string, string> = {
  'usdd': 'USDD stablecoin already trades (~$1.44B mcap, 2026-11-18); governance via JST, not a new token',
  'bittensor-dtao': 'TAO already trades (~$2.3B mcap, 2026-11-18); dTAO is the subnet-alpha market, not a new token',
  'plume-vaults': 'PLUME already trades (TGE Jan 2025, ~$80M mcap 2026-11-18); vaults are a product of the chain; Season 2 ended 31 Mar 2026 and its claim window closed Aug 2026',
  'mezo-earn': 'MEZO already trades (~$1.5M mcap, 2026-11-18, on Coinbase/Gate/MEXC; -98% from its Apr 2026 ATH); mats are activity points, and Mezo Earn itself is still marked coming soon',
};

/** The one no-thesis row (plausibility 0.10). */
export const NO_THESIS_SLUGS: Record<string, string> = {
  'lightning-network': 'Bitcoin payment network; no token, no token thesis',
};

/** Slugs with no points program of their own and no public token path (plausibility 0.50). */
export const NO_POINTS_ALLOCATOR_SLUGS: Record<string, string> = {
  'lagoon': 'No Lagoon points program found (checked 2026-11-18: lagoon.finance blog/docs, web search); Lagoon is an ERC-7540 vault factory, not a points issuer, and no public token path was found',
};

/** Rows whose 1.00 plausibility rests on a verified note, not on the default. */
export const VERIFIED_PLAUSIBILITY_NOTES: Record<string, string> = {
  'upshift': 'Season 2 points live (5x boost until $750M TVL, checked 2026-10-12); official docs promise no token, so points are a possible — not promised — path to a future allocation',
  'veda': 'Points formula verified (USD x 0.01 x days), but no Veda-run points season was confirmed open as of 2026-11-13; live incentives sit with the vault brands (e.g. ether.fi Liquid membership points)',
  'symbiotic': 'Points since mid-2024 with no confirmed named campaign and no token promise; TVL fell 41% from 2 Oct to 7 Nov 2026 — verify on the official app before depositing',
};

/** The model's constants, as the dashboard states them and the sandbox replays them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_one: number;
  chain_few: number;
  chain_many: number;
  chain_wide: number;
  fdv_low: number;
  fdv_high: number;
  range_min_comps: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -20,
  growth_cap: 20,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 512,
  chain_one: 1.0,
  chain_few: 1.05,
  chain_many: 1.1,
  chain_wide: 1.15,
  fdv_low: 2,
  fdv_high: 4,
  range_min_comps: 4,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category: string | null;
    category_multiple: number;
    category_multiple_basis: string;
    confidence: 'high' | 'medium' | 'low';
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    chain_count: number;
    double_count_multiplier: number;
    plausibility: number;
    plausibility_reason: string;
    fdv_low_usd: number;
    fdv_high_usd: number;
    range_low_usd: number | null;
    range_high_usd: number | null;
    comparables_n: number;
    comparables_median: number | null;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, farm plan included so board and page agree exactly. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  model: BoardRow['model'];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One live-token comparable behind a category multiple. */
export interface Comparable {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** A category's comparables as the dashboard shows them. */
export interface CategoryStats {
  category: string;
  n: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  comps: Comparable[];
}

/** One held-out validation run: the blend against its two parents on the same split. */
export interface ValidationMetric {
  method: string;
  split: string;
  n_train: number;
  n_test: number;
  ridge_rmse: number;
  ridge_r2: number;
  baseline_rmse: number;
  baseline_r2: number;
  blend_rmse: number;
  blend_r2: number;
}

/** The out-of-sample validation block the dashboard renders. Errors are log-scale RMSE on held-out log(mcap). */
export interface ValidationReport {
  method: string;
  lambda: number;
  ridge_weight: number;
  n_comps: number;
  folds: number;
  held_out_rmse: number;
  held_out_r2: number;
  baseline_rmse: number;
  baseline_r2: number;
  n_test: number;
  ridge_rmse_cv: number;
  ridge_r2_cv: number;
  blend_rmse_cv: number;
  blend_r2_cv: number;
  walkforward_2025_01_01_blend_rmse: number;
  walkforward_2025_01_01_blend_r2: number;
  walkforward_2025_01_01_baseline_rmse: number;
  walkforward_2025_01_01_baseline_r2: number;
  walkforward_2025_06_30_blend_rmse: number;
  walkforward_2025_06_30_blend_r2: number;
  walkforward_2025_06_30_baseline_rmse: number;
  walkforward_2025_06_30_baseline_r2: number;
  size_curve_slope: number;
  conclusion: string;
  metrics: ValidationMetric[];
  size_curve: {
    slope: number;
    terciles: { tvl_low_m: number; tvl_high_m: number; median_ratio: number; n: number }[];
    families: { family: string; terciles: (number | null)[] }[];
    elasticity_at: { tvl_usd: number; elasticity: number }[];
    quadratic_cv_rmse: number;
    no_quadratic_cv_rmse: number;
  };
  coefficients: {
    lambda: number;
    intercept: number;
    log_tvl: number;
    log_tvl_sq: number;
    log_age: number;
    log_chains: number;
    categories: { category: string; coefficient: number }[];
  };
}

/** Everything the dashboard needs: the board, the live set, the model tables, the comps and the validation. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  watchlist_implied_sum_usd: number;
  category_multiples: Record<string, CategoryMultiple>;
  fallback_multiple: CategoryMultiple;
  plausibility_rules: { factor: number; reason: string }[];
  token_exists: Record<string, string>;
  no_thesis: Record<string, string>;
  categories: CategoryStats[];
  rows: RadarRow[];
  live: LiveRow[];
  validation: ValidationReport;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The chain-breadth factor from a chain count. */
export function chainMultiplier(chainCount: number, model: ModelConstants): number {
  if (chainCount >= 10) return model.chain_wide;
  if (chainCount >= 4) return model.chain_many;
  if (chainCount >= 2) return model.chain_few;
  return model.chain_one;
}

/** The double-count haircut for a category (1.00 unless the table says otherwise). */
export function doubleCountMultiplier(category: string | null): number {
  if (category === null) return 1;
  return DOUBLE_COUNT[category] ?? 1;
}

/** The category multiple entry for a category (the fallback entry when unlisted). */
export function categoryMultiple(category: string | null): CategoryMultiple {
  if (category === null) return FALLBACK_MULTIPLE;
  return CATEGORY_MULTIPLES[category] ?? FALLBACK_MULTIPLE;
}

/**
 * The plausibility factor and its reason, from the published rule table.
 * First match wins: a token that already trades, then no token thesis,
 * then a weak chain-token thesis, then an allocator with no points program
 * of its own (Lagoon), then a private curator firm, else 1.00 — with a
 * verified note where one exists (Upshift, Veda, Symbiotic).
 */
export function plausibility(protocol: SnapshotProtocol): { factor: number; reason: string } {
  const tokenNote = TOKEN_EXISTS_SLUGS[protocol.slug];
  if (tokenNote !== undefined) return { factor: 0.2, reason: tokenNote };
  const thesisNote = NO_THESIS_SLUGS[protocol.slug];
  if (thesisNote !== undefined) return { factor: 0.1, reason: thesisNote };
  if (protocol.category === 'Chain') {
    return { factor: 0.2, reason: 'Chain category: the token thesis for an appchain is weak, and the chain itself is the product' };
  }
  const allocatorNote = NO_POINTS_ALLOCATOR_SLUGS[protocol.slug];
  if (allocatorNote !== undefined) return { factor: 0.5, reason: allocatorNote };
  if (protocol.category === 'Risk Curators') {
    return { factor: 0.5, reason: 'Private curator firm; no points program and no public token path found in research' };
  }
  const verifiedNote = VERIFIED_PLAUSIBILITY_NOTES[protocol.slug];
  if (verifiedNote !== undefined) return { factor: 1, reason: verifiedNote };
  return { factor: 1, reason: 'Public deposit product with a plausible token path' };
}

/** A percentile of a sorted array by linear interpolation; null when empty. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (rank - lo);
}

/**
 * The live-token comparables behind every category multiple, from the
 * snapshot itself: protocols with a market cap and positive TVL whose
 * mcap/TVL lies in (0, 3]. Versioned products (aave-v3, morpho-blue) carry
 * a symbol but no market cap, so they never enter the pool. Sixteen of the
 * 144 non-null market caps are zero and twelve more have a ratio above 3,
 * so the winsorised pool is 116 protocols.
 */
export function categoryStats(snapshot: Snapshot): Map<string, CategoryStats> {
  const ratios = new Map<string, Comparable[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!(ratio > 0 && ratio <= 3)) continue;
    const list = ratios.get(p.category ?? 'Other') ?? [];
    list.push({ slug: p.slug, name: p.name, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, ratio: round4(ratio) });
    ratios.set(p.category ?? 'Other', list);
  }
  const out = new Map<string, CategoryStats>();
  for (const [category, comps] of ratios) {
    const sorted = comps.map((c) => c.ratio).sort((a, b) => a - b);
    const byTvl = [...comps].sort((a, b) => b.tvl_usd - a.tvl_usd).slice(0, 6);
    out.set(category, {
      category,
      n: comps.length,
      median: percentile(sorted, 0.5),
      p25: percentile(sorted, 0.25),
      p75: percentile(sorted, 0.75),
      comps: byTvl,
    });
  }
  return out;
}

/** The winsorised comparables pool itself, for the ridge fit and the validation. */
export function comparablePool(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.mcap_usd / p.tvl_usd > 0 && p.mcap_usd / p.tvl_usd <= 3,
  );
}

/** Solve A x = b by Gaussian elimination with partial pivoting. A is small (under 25 rows); no library needed. */
export function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    if (Math.abs(m[piv]![col]!) < 1e-12) throw new Error('ridge system is singular');
    const tmp = m[col]!;
    m[col] = m[piv]!;
    m[piv] = tmp;
    for (let r = col + 1; r < n; r++) {
      const f = m[r]![col]! / m[col]![col]!;
      for (let k = col; k <= n; k++) m[r]![k]! -= f * m[col]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= m[r]![k]! * x[k]!;
    x[r] = s / m[r]![r]!;
  }
  return x;
}

/**
 * A fitted ridge: standardised coefficients, the standardisation it was
 * fit with, and the category dummies it carries. Features, in order:
 * log(TVL), (log TVL - 17.5)^2 (the size curve), log(age), log(1 + chains),
 * then one dummy per category with at least 3 comps in the fit set.
 */
export interface RidgeFit {
  lambda: number;
  means: number[];
  sds: number[];
  categories: string[];
  coefficients: number[];
  useQuadratic: boolean;
}

/** The four continuous ridge features of a protocol, unstandardised. Age unknown counts as 512 days, age 0 as 1 day. */
function rawFeatures(protocol: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, protocol.listed_at) ?? MODEL.unknown_age_days;
  const lt = Math.log(protocol.tvl_usd);
  return [lt, (lt - 17.5) * (lt - 17.5), Math.log(Math.max(age, 1)), Math.log(1 + protocol.chains.length)];
}

/** The standardised feature vector of a protocol under a fit (intercept first). */
export function ridgeFeatures(fit: RidgeFit, protocol: SnapshotProtocol, asOf: string): number[] {
  const raw = rawFeatures(protocol, asOf);
  const keys = fit.useQuadratic ? [0, 1, 2, 3] : [0, 2, 3];
  const z = keys.map((k, i) => (raw[k]! - fit.means[i]!) / fit.sds[i]!);
  const dummies = fit.categories.map((c) => ((protocol.category ?? 'Other') === c ? 1 : 0));
  return [1, ...z, ...dummies];
}

/** Fit the ridge on a set of comparables: standardise, then solve (X'X + lambda I) b = X'y with the intercept unpenalised. */
export function fitRidge(train: SnapshotProtocol[], asOf: string, lambda: number = RIDGE_LAMBDA, useQuadratic: boolean = true): RidgeFit {
  const counts = new Map<string, number>();
  for (const p of train) counts.set(p.category ?? 'Other', (counts.get(p.category ?? 'Other') ?? 0) + 1);
  const categories = [...counts.entries()].filter(([, n]) => n >= 3).map(([c]) => c).sort();
  const keys = useQuadratic ? [0, 1, 2, 3] : [0, 2, 3];
  const means: number[] = [];
  const sds: number[] = [];
  for (const k of keys) {
    const vals = train.map((p) => rawFeatures(p, asOf)[k]!);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length) || 1;
    means.push(mean);
    sds.push(sd);
  }
  const fit: RidgeFit = { lambda, means, sds, categories, coefficients: [], useQuadratic };
  const x = train.map((p) => ridgeFeatures(fit, p, asOf));
  const y = train.map((p) => Math.log(p.mcap_usd!));
  const d = x[0]!.length;
  const xtx: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  const xty = new Array<number>(d).fill(0);
  for (let i = 0; i < x.length; i++) {
    for (let a = 0; a < d; a++) {
      xty[a]! += x[i]![a]! * y[i]!;
      for (let b = 0; b < d; b++) xtx[a]![b]! += x[i]![a]! * x[i]![b]!;
    }
  }
  for (let a = 1; a < d; a++) xtx[a]![a]! += lambda;
  fit.coefficients = solveLinear(xtx, xty);
  return fit;
}

/** The ridge's predicted log(mcap) for a protocol. */
export function ridgePredict(fit: RidgeFit, protocol: SnapshotProtocol, asOf: string): number {
  const x = ridgeFeatures(fit, protocol, asOf);
  return x.reduce((s, v, i) => s + v * fit.coefficients[i]!, 0);
}

/** The raw (unstandardised) slope of one continuous feature in a fit. */
export function rawBeta(fit: RidgeFit, keyIndex: number): number {
  const keys = fit.useQuadratic ? [0, 1, 2, 3] : [0, 2, 3];
  const pos = keys.indexOf(keyIndex);
  if (pos < 0) return 0;
  return fit.coefficients[1 + pos]! / fit.sds[pos]!;
}

/** The radar-2 baseline multiple for a category, recomputed from a training set only (train-only medians plus the same judgemental overrides as the published table). */
export function validationBaselineMultiple(train: SnapshotProtocol[], category: string | null): number {
  const by = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of train) {
    const r = p.mcap_usd! / p.tvl_usd;
    const list = by.get(p.category ?? 'Other') ?? [];
    list.push(r);
    by.set(p.category ?? 'Other', list);
    all.push(r);
  }
  const med = (cat: string): number | null => {
    const list = by.get(cat);
    if (!list || list.length === 0) return null;
    return percentile([...list].sort((a, b) => a - b), 0.5);
  };
  const overall = percentile([...all].sort((a, b) => a - b), 0.5) ?? FALLBACK_MULTIPLE.multiple;
  const cat = category ?? 'Other';
  if (cat === 'Risk Curators') return 0.05;
  if (cat === 'Onchain Capital Allocator') return 0.05;
  if (cat === 'Chain') return 0.25;
  if (cat === 'Collateral Markets') return med('Restaking') ?? overall;
  if (cat === 'Staking Pool') {
    const s = med('Staking Pool');
    return s === null ? 0.02 : Math.max(s, 0.02);
  }
  const list = by.get(cat);
  if (list !== undefined && list.length >= 2) return med(cat)!;
  return overall;
}

/** Held-out log-scale RMSE and R2 of predictions against actual log(mcap). */
function heldOutMetrics(predicted: number[], actual: number[]): { rmse: number; r2: number } {
  const n = predicted.length;
  const rmse = Math.sqrt(predicted.reduce((s, p, i) => s + (p - actual[i]!) * (p - actual[i]!), 0) / n);
  const mean = actual.reduce((s, v) => s + v, 0) / n;
  const ssTot = actual.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  const ssRes = predicted.reduce((s, p, i) => s + (p - actual[i]!) * (p - actual[i]!), 0);
  return { rmse: round4(rmse), r2: round4(1 - ssRes / ssTot) };
}

/** Five stratified folds: within each category, slugs sorted, dealt round-robin — deterministic, no randomness. */
function stratifiedFolds(pool: SnapshotProtocol[]): SnapshotProtocol[][] {
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of pool) {
    const list = byCat.get(p.category ?? 'Other') ?? [];
    list.push(p);
    byCat.set(p.category ?? 'Other', list);
  }
  const folds: SnapshotProtocol[][] = Array.from({ length: 5 }, () => []);
  // Rotate the starting fold per category so singleton categories spread
  // across folds instead of all landing in fold 0.
  let start = 0;
  for (const cat of [...byCat.keys()].sort()) {
    const arr = [...byCat.get(cat)!].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    arr.forEach((p, i) => folds[(start + i) % 5]!.push(p));
    start = (start + 1) % 5;
  }
  return folds;
}

/** The median mcap/TVL of a set of comps, or null when empty. */
function medianRatio(pool: SnapshotProtocol[]): number | null {
  if (pool.length === 0) return null;
  return percentile(pool.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b), 0.5);
}

/**
 * The full out-of-sample validation, recomputed from the snapshot at build
 * time: 5-fold stratified CV (with a no-quadratic ablation), two
 * walk-forwards split on listed_at, and the size curve (log-ratio slope,
 * TVL terciles overall and per family, fitted elasticity by TVL). The
 * baseline in every run is the radar-2 rule (train-only medians plus the
 * judgemental overrides), so the comparison is against the model radar-3
 * replaces, not against a straw man.
 */
export function validateModel(snapshot: Snapshot): ValidationReport {
  const pool = comparablePool(snapshot);
  const asOf = snapshot.as_of;
  const metrics: ValidationMetric[] = [];

  // 5-fold stratified CV: ridge, baseline, blend.
  const folds = stratifiedFolds(pool);
  const cvRidge: number[] = [];
  const cvBase: number[] = [];
  const cvBlend: number[] = [];
  const cvActual: number[] = [];
  const cvNoQuad: number[] = [];
  const cvTrainSizes: number[] = [];
  for (let f = 0; f < 5; f++) {
    const test = folds[f]!;
    const train = folds.flatMap((x, i) => (i === f ? [] : x));
    cvTrainSizes.push(train.length);
    const fit = fitRidge(train, asOf, RIDGE_LAMBDA, true);
    const fitNoQuad = fitRidge(train, asOf, RIDGE_LAMBDA, false);
    for (const p of test) {
      const r = ridgePredict(fit, p, asOf);
      const rq = ridgePredict(fitNoQuad, p, asOf);
      const b = Math.log(p.tvl_usd) + Math.log(validationBaselineMultiple(train, p.category));
      cvRidge.push(r);
      cvNoQuad.push(rq);
      cvBase.push(b);
      cvBlend.push(RIDGE_WEIGHT * r + (1 - RIDGE_WEIGHT) * b);
      cvActual.push(Math.log(p.mcap_usd!));
    }
  }
  const cvR = heldOutMetrics(cvRidge, cvActual);
  const cvB = heldOutMetrics(cvBase, cvActual);
  const cvL = heldOutMetrics(cvBlend, cvActual);
  const cvQ = heldOutMetrics(cvNoQuad, cvActual);
  const cvTrainMin = Math.min(...cvTrainSizes);
  const cvTrainMax = Math.max(...cvTrainSizes);
  metrics.push({
    method: '5-fold stratified CV (by category, slug order)',
    split: `all 116 comps, each held out once; train ${cvTrainMin}–${cvTrainMax} per fold`,
    n_train: cvTrainMin,
    n_test: 116,
    ridge_rmse: cvR.rmse,
    ridge_r2: cvR.r2,
    baseline_rmse: cvB.rmse,
    baseline_r2: cvB.r2,
    blend_rmse: cvL.rmse,
    blend_r2: cvL.r2,
  });

  // Walk-forwards: fit on protocols listed before the cut, predict those listed after.
  const wf: { cut: string; blend: { rmse: number; r2: number }; base: { rmse: number; r2: number }; ridge: { rmse: number; r2: number }; nTrain: number; nTest: number }[] = [];
  for (const cut of ['2025-01-01', '2025-06-30']) {
    const train = pool.filter((p) => p.listed_at !== null && p.listed_at < cut);
    const test = pool.filter((p) => p.listed_at !== null && p.listed_at >= cut);
    const fit = fitRidge(train, asOf, RIDGE_LAMBDA, true);
    const rp: number[] = [];
    const bp: number[] = [];
    const lp: number[] = [];
    const ap: number[] = [];
    for (const p of test) {
      const r = ridgePredict(fit, p, asOf);
      const b = Math.log(p.tvl_usd) + Math.log(validationBaselineMultiple(train, p.category));
      rp.push(r);
      bp.push(b);
      lp.push(RIDGE_WEIGHT * r + (1 - RIDGE_WEIGHT) * b);
      ap.push(Math.log(p.mcap_usd!));
    }
    const rr = heldOutMetrics(rp, ap);
    const bb = heldOutMetrics(bp, ap);
    const ll = heldOutMetrics(lp, ap);
    wf.push({ cut, blend: ll, base: bb, ridge: rr, nTrain: train.length, nTest: test.length });
    metrics.push({
      method: 'walk-forward',
      split: `listed_at < ${cut} trains, >= ${cut} tests (28 null-date comps excluded from both sides)`,
      n_train: train.length,
      n_test: test.length,
      ridge_rmse: rr.rmse,
      ridge_r2: rr.r2,
      baseline_rmse: bb.rmse,
      baseline_r2: bb.r2,
      blend_rmse: ll.rmse,
      blend_r2: ll.r2,
    });
  }

  // Size curve: OLS slope of log(mcap/TVL) on log(TVL), terciles overall and per family.
  const xs = pool.map((p) => Math.log(p.tvl_usd));
  const ys = pool.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0) / xs.reduce((s, x) => s + (x - mx) * (x - mx), 0);
  const byTvl = [...pool].sort((a, b) => a.tvl_usd - b.tvl_usd);
  const t = Math.floor(byTvl.length / 3);
  const terciles = [0, 1, 2].map((i) => {
    const bin = byTvl.slice(i * t, i === 2 ? undefined : (i + 1) * t);
    return {
      tvl_low_m: round4(bin[0]!.tvl_usd / 1e6),
      tvl_high_m: round4(bin[bin.length - 1]!.tvl_usd / 1e6),
      median_ratio: round4(medianRatio(bin) ?? 0),
      n: bin.length,
    };
  });
  const families: { family: string; cats: string[] }[] = [
    { family: 'Lending', cats: ['Lending'] },
    { family: 'Dexs', cats: ['Dexs'] },
    { family: 'RWA', cats: ['RWA'] },
    { family: 'Yield', cats: ['Yield'] },
    { family: 'Restaking group', cats: ['Restaking', 'Collateral Markets', 'Staking Pool', 'Liquid Staking'] },
    { family: 'Curator / Allocator', cats: ['Risk Curators', 'Onchain Capital Allocator'] },
  ];
  const familyTerciles = families.map(({ family, cats }) => {
    const ps = [...pool.filter((p) => cats.includes(p.category ?? ''))].sort((a, b) => a.tvl_usd - b.tvl_usd);
    if (ps.length < 3) return { family, terciles: [null, null, null] as (number | null)[] };
    const ft = Math.floor(ps.length / 3);
    return {
      family,
      terciles: [0, 1, 2].map((i) => {
        const bin = ps.slice(i * ft, i === 2 ? undefined : (i + 1) * ft);
        const m = medianRatio(bin);
        return m === null ? null : round4(m);
      }),
    };
  });

  // Fitted elasticity d log(mcap) / d log(TVL) at four TVLs, from the full fit.
  const fullFit = fitRidge(pool, asOf, RIDGE_LAMBDA, true);
  const bLt = rawBeta(fullFit, 0);
  const bLt2 = rawBeta(fullFit, 1);
  const elasticityAt = [5_000_000, 50_000_000, 500_000_000, 5_000_000_000].map((tvl) => ({
    tvl_usd: tvl,
    elasticity: round4(bLt + 2 * bLt2 * (Math.log(tvl) - 17.5)),
  }));
  const cats = fullFit.categories.map((c, i) => ({ category: c, coefficient: round4(fullFit.coefficients[5 + i]!) }));

  const report: ValidationReport = {
    method: 'Ridge of log(mcap) on log TVL, (log TVL)^2, log age, log(1+chains) and category dummies (lambda=100), blended 50/50 in log space with the radar-2 category-median baseline. Validated out-of-sample by 5-fold stratified CV and two walk-forwards (cuts 2025-01-01, 2025-06-30). All errors are log-scale RMSE on held-out log(mcap).',
    lambda: RIDGE_LAMBDA,
    ridge_weight: RIDGE_WEIGHT,
    n_comps: pool.length,
    folds: 5,
    held_out_rmse: cvL.rmse,
    held_out_r2: cvL.r2,
    baseline_rmse: cvB.rmse,
    baseline_r2: cvB.r2,
    n_test: pool.length,
    ridge_rmse_cv: cvR.rmse,
    ridge_r2_cv: cvR.r2,
    blend_rmse_cv: cvL.rmse,
    blend_r2_cv: cvL.r2,
    walkforward_2025_01_01_blend_rmse: wf[0]!.blend.rmse,
    walkforward_2025_01_01_blend_r2: wf[0]!.blend.r2,
    walkforward_2025_01_01_baseline_rmse: wf[0]!.base.rmse,
    walkforward_2025_01_01_baseline_r2: wf[0]!.base.r2,
    walkforward_2025_06_30_blend_rmse: wf[1]!.blend.rmse,
    walkforward_2025_06_30_blend_r2: wf[1]!.blend.r2,
    walkforward_2025_06_30_baseline_rmse: wf[1]!.base.rmse,
    walkforward_2025_06_30_baseline_r2: wf[1]!.base.r2,
    size_curve_slope: round4(slope),
    conclusion: `Blend (lambda=100, weight 0.5) beats both parents on all three held-out tests: CV RMSE ${cvL.rmse} vs ridge ${cvR.rmse} vs baseline ${cvB.rmse}; walk-forward 2025-01-01 ${wf[0]!.blend.rmse} vs ${wf[0]!.ridge.rmse} / ${wf[0]!.base.rmse}; walk-forward 2025-06-30 ${wf[1]!.blend.rmse} vs ${wf[1]!.ridge.rmse} / ${wf[1]!.base.rmse}. Pure ridge wins the CV but loses both walk-forwards; the category median wins neither. The blend is the final model.`,
    metrics,
    size_curve: {
      slope: round4(slope),
      terciles,
      families: familyTerciles,
      elasticity_at: elasticityAt,
      quadratic_cv_rmse: cvR.rmse,
      no_quadratic_cv_rmse: cvQ.rmse,
    },
    coefficients: {
      lambda: RIDGE_LAMBDA,
      intercept: round4(fullFit.coefficients[0]!),
      log_tvl: round4(bLt),
      log_tvl_sq: round4(bLt2),
      log_age: round4(rawBeta(fullFit, 2)),
      log_chains: round4(rawBeta(fullFit, 3)),
      categories: cats,
    },
  };
  return report;
}

/** The full scoring of one protocol: every factor and the implied value. */
export interface Scored {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  dblcount: number;
  plaus: number;
  plausReason: string;
  multiple: CategoryMultiple;
  age: number | null;
  ageForModel: number;
  rangeLow: number | null;
  rangeHigh: number | null;
  compN: number;
  compMedian: number | null;
  ridgeLog: number;
  baselineLog: number;
  effectiveMultiple: number;
}

export function scoreProtocol(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  stats: Map<string, CategoryStats>,
  fit: RidgeFit,
): Scored {
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = chainMultiplier(protocol.chains.length, model);
  const dblcount = doubleCountMultiplier(protocol.category);
  const { factor: plaus, reason: plausReason } = plausibility(protocol);
  const baseEntry = categoryMultiple(protocol.category);
  // radar-3 core: the log-space blend of the ridge prediction and the
  // radar-2 category-median baseline. The effective multiple is the core
  // per dollar of TVL, so the dashboard's replay (TVL x multiple x growth
  // x maturity x chain x double-count x plausibility) reproduces the
  // board value exactly, using the same factor order.
  const ridgeLog = ridgePredict(fit, protocol, asOf);
  const baselineLog = Math.log(protocol.tvl_usd) + Math.log(baseEntry.multiple);
  const coreLog = RIDGE_WEIGHT * ridgeLog + (1 - RIDGE_WEIGHT) * baselineLog;
  const effectiveMultiple = round4(Math.exp(coreLog) / protocol.tvl_usd);
  const multiple: CategoryMultiple = {
    multiple: effectiveMultiple,
    basis: `radar-3 blend: 50% ridge (lambda=${RIDGE_LAMBDA}) + 50% category median ${baseEntry.multiple} (n=${stats.get(protocol.category ?? 'Other')?.n ?? 0} comps)`,
    confidence: baseEntry.confidence,
  };
  const implied = Math.max(1, Math.round(protocol.tvl_usd * effectiveMultiple * growthMult * maturityMult * chainMult * dblcount * plaus));
  const catStats = stats.get(protocol.category ?? 'Other');
  const compN = catStats?.n ?? 0;
  const compMedian = catStats?.median ?? null;
  let rangeLow: number | null = null;
  let rangeHigh: number | null = null;
  if (catStats !== undefined && compN >= model.range_min_comps && catStats.p25 !== null && catStats.p75 !== null) {
    // Same blend, with the p25/p75 ratio in place of the median in the baseline half.
    const rest = growthMult * maturityMult * chainMult * dblcount * plaus;
    const eff25 = round4(Math.exp(RIDGE_WEIGHT * ridgeLog + (1 - RIDGE_WEIGHT) * (Math.log(protocol.tvl_usd) + Math.log(catStats.p25))) / protocol.tvl_usd);
    const eff75 = round4(Math.exp(RIDGE_WEIGHT * ridgeLog + (1 - RIDGE_WEIGHT) * (Math.log(protocol.tvl_usd) + Math.log(catStats.p75))) / protocol.tvl_usd);
    rangeLow = Math.max(1, Math.round(protocol.tvl_usd * eff25 * rest));
    rangeHigh = Math.max(1, Math.round(protocol.tvl_usd * eff75 * rest));
  }
  return { implied, growthPct, growthMult, maturityMult, chainMult, dblcount, plaus, plausReason, multiple, age, ageForModel, rangeLow, rangeHigh, compN, compMedian, ridgeLog, baselineLog, effectiveMultiple };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, not an exchange,
 * not a versioned pool. Odd slugs stay in: `current` is a real Sui lender
 * with a points program, `project-0` is the former MarginFi (no token,
 * TVL ~96% below its 2024 peak), and `shift-defi`'s +4,448% week is an
 * adapter onboarding institutional PYUSD/RLUSD vaults on 8 Nov 2026, not a
 * data error — the growth clamp bounds it, and its farm plan says so.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const stats = categoryStats(snapshot);
  const fit = fitRidge(comparablePool(snapshot), snapshot.as_of, RIDGE_LAMBDA, true);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug the snapshot carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, model, stats, fit) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((entry, i) => {
    const { p, s } = entry;
    const confidence: 'high' | 'medium' | 'low' = s.plaus < 1 ? 'low' : s.multiple.confidence;
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        category: p.category,
        category_multiple: s.multiple.multiple,
        category_multiple_basis: s.multiple.basis,
        confidence,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        chain_multiplier: s.chainMult,
        chain_count: p.chains.length,
        double_count_multiplier: s.dblcount,
        plausibility: s.plaus,
        plausibility_reason: s.plausReason,
        fdv_low_usd: s.implied * model.fdv_low,
        fdv_high_usd: s.implied * model.fdv_high,
        range_low_usd: s.rangeLow,
        range_high_usd: s.rangeHigh,
        comparables_n: s.compN,
        comparables_median: s.compMedian === null ? null : round4(s.compMedian),
        age_days: s.age,
      },
      farm_steps: farmSteps(p, s.ageForModel).map(stepText),
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's effective age: younger protocols get a longer qualifying window. */
function holdDaysFor(ageForModel: number): number {
  if (ageForModel < 180) return 60;
  if (ageForModel < 365) return 45;
  return 30;
}

/**
 * The farm action for a protocol's category, in words a farmer can follow.
 * The action names the deposit, not a points program the snapshot cannot
 * verify: step 3 of every plan tells the farmer to check the protocol's own
 * points page first, and to treat the position as yield-only when there is
 * none.
 */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it; most RWA mints need KYC or an allowlist, so check access first`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy`;
  if (c.includes('chain')) return `Use ${name} on its own chain with $${capital} and hold the position; there is no retail points farm on an appchain`;
  if (c.includes('payment')) return `Open a payment channel on ${name} with $${capital} of liquidity and keep it online to earn routing fees`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open`;
}

/**
 * The rows with no live launch to farm, and what to do instead. These are
 * the methodology's edge cases: a token already trades for the entity, a
 * points season has closed, or there is no token thesis at all. A "no
 * farm" row says so in its first step instead of inventing tasks.
 */
function noFarmNote(p: SnapshotProtocol): string | null {
  switch (p.slug) {
    case 'usdd':
      return 'There is no launch to farm here: USDD already trades, so farm its yield instead of an airdrop';
    case 'bittensor-dtao':
      return 'There is no launch to farm here: TAO already trades, so farm subnet yield instead of an airdrop';
    case 'plume-vaults':
      return 'There is no live farm here: Plume Points Season 2 is closed (points earning ended 31 Mar 2026, registration closed 27 May 2026, claim window closed Aug 2026)';
    case 'lightning-network':
      return 'There is no token to farm here: the Lightning Network is a Bitcoin payment network with no token and no airdrop';
    default:
      return null;
  }
}

/** The follow-through for a no-farm row: the yield or activity that replaces the launch farm. */
function noFarmAction(p: SnapshotProtocol, capital: number, chain: string): string {
  switch (p.slug) {
    case 'usdd':
      return `Deposit $${capital} into sUSDD savings or lend USDD on JustLend on ${chain} and hold the yield position`;
    case 'bittensor-dtao':
      return `Stake $${capital} of TAO to a validator, or swap TAO into a subnet alpha pool on ${chain}, and hold the position`;
    case 'plume-vaults':
      return `Stake PLUME, or deposit $${capital} into a Nest vault on ${chain}, for ongoing yield instead of points`;
    case 'lightning-network':
      return `Open a Lightning channel with $${capital} of BTC, keep the node online, and earn routing fees on forwarded payments`;
    default:
      return actionFor(p, capital, chain);
  }
}

/**
 * Per-protocol farm plans, written from the 2026-11-18 verification
 * research (token-radar-02-research.md). Every step names a real venue,
 * chain, cost and time; gas figures are the research's estimates. Rows
 * with no retail farm (Keyrock, Tulipa) say so and watch instead of
 * inventing tasks. Returns null where the generic plan applies.
 */
function specificFarmSteps(p: SnapshotProtocol, capital: number, chain: string, hold: number): FarmStep[] | null {
  const gasMain = 'about $2–10 of gas per transaction (estimate)';
  const claimOnly = 'Claim only from the official link the protocol itself publishes; never pay to claim, and never follow a claim link from a chat or an ad';
  switch (p.slug) {
    case 'upshift':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDC on Ethereum or Base', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: 'Open app.upshift.finance and, on the Points page, confirm Season 2 is still live and the 5x boost has not hit the $750M TVL cap (it was $515M on 2026-10-12)', cost: 'no fee to check', time: '10 minutes' },
        { text: `Deposit $${capital} of USDC into an Upshift vault (e.g. earnAUSD or a USDC vault) and hold the shares: 1x points, 5x until total TVL reaches $750M`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: 'Optional boost: deposit the vault share token (e.g. upUSDC) into Morpho as collateral (5x), or LP / hold YT on Pendle (7.5x, earnAUSD)', cost: gasMain, time: '20 minutes' },
        { text: `Hold at least ${hold} days; check the points balance and TVL progress weekly — the boost disappears once $750M is reached, and points decay over time`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: `${claimOnly}. Upshift's docs promise no token, so treat points as a possible — not promised — future allocation and judge the position on vault APY first`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'lagoon':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDC on Ethereum mainnet', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: 'Open app.lagoon.finance, browse the vault list, and pick a public vault (e.g. a 9Summits USDC vault or a Liquity BOLD-ecosystem vault); read the curator, strategy, fees and redemption cycle first (ERC-7540 async settlement, redemption waits for the next cycle, about 1 day)', cost: 'no fee to check', time: '15 minutes' },
        { text: `Deposit $${capital} of USDC, wait for the NAV update, then claim the vault share token`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up, plus the NAV wait' },
        { text: 'Yield comes from two sources only: the vault\'s own APY (about 3%–22% by strategy) plus the chosen vault\'s underlying-protocol rewards (e.g. BOLD fork rewards); Lagoon itself issues no points — do not deposit for a "Lagoon airdrop"', cost: 'no fee to check', time: '10 minutes' },
        { text: `Hold at least ${hold} days; to exit, submit a redemption request first, then claim once the settlement cycle completes`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: claimOnly, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'mezo-earn':
      return [
        { text: 'MEZO already trades (~$1.5M mcap, 2026-11-18, on Coinbase/Gate/MEXC) — there is no new token to farm. Use a fresh wallet, seed offline, and prepare tBTC from an Ethereum wallet or MUSD; the native BTC bridge-in closed 13 Oct 2026, so a BTC wallet cannot deposit directly', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: `On Mezo, post tBTC as collateral and borrow MUSD (fixed rates from 1%, up to 90% LTV), or deposit $${capital} of MUSD into the MUSD Savings Vault and hold sMUSD for protocol fees`, cost: `$${capital} of capital and about $2–10 of gas (estimate)`, time: '15 minutes to set up' },
        { text: 'Optional: stake sMUSD into a gauge to share the weekly MEZO emissions, or lock MEZO for veMEZO / BTC for veBTC to raise voting weight (veMEZO lifts veBTC weight up to 5x)', cost: 'about $2–10 of gas per transaction (estimate)', time: '20 minutes' },
        { text: `Hold at least ${hold} days; mats are still referenced by the ecosystem, but no official confirmation was found that new mats are being issued — treat them as a bonus, not the main return`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: 'Check the position weekly; note the 4.7M MEZO emissions unlock on 19 Nov 2026 and expect short-term sell pressure before adding to any MEZO position', cost: 'no fee to check', time: '5 minutes a week' },
        { text: `${claimOnly} — operate only from mezo.org links. Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'veda':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare ETH or USDC', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: 'Open a Veda-powered vault (Liquid ETH, Bera ETH, Mizu, or a Turtle Club campaign) and check which brand\'s incentives are live: Veda points run USD x 0.01 x days, but no Veda-run season was confirmed open as of 2026-11-13', cost: 'no fee to check', time: '15 minutes' },
        { text: `Deposit $${capital} into the vault and hold the shares (weETHs for the Liquid ETH vault); ether.fi counts Liquid vault deposits toward its membership points`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: `Hold at least ${hold} days; Veda has never announced a token, so judge the position on vault yield and the vault brand's live points, not on a Veda airdrop`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: 'Check weekly whether a Veda season has reopened and what the vault APY is; the live incentives sit with the brands that run the vaults', cost: 'no fee to check', time: '5 minutes a week' },
        { text: `${claimOnly}. Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'symbiotic':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare wstETH, cbETH or rETH (check the vault registry first)', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: `Deposit $${capital} into a Symbiotic vault on Ethereum and hold the restaked position; points have run since mid-2024, but there is no confirmed named campaign and no token promise — treat any airdrop as a bonus, not the reason to deposit`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: 'Check the official app for what is actually tracked and rewarded before depositing, and read the vault\'s slashing terms — they are per-vault', cost: 'no fee to check', time: '15 minutes' },
        { text: 'Size the position for a bet that has not produced a token in two years ($34.8M raised, no token): TVL fell 41% from 2 Oct to 7 Nov 2026, and Core V2 lets vault funds enter external lending markets since 1 Jul 2026', cost: 'no fee to check', time: '10 minutes' },
        { text: `Hold at least ${hold} days and make one qualifying action a week, such as a deposit or a vote, so the activity is counted in more than one snapshot`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: `${claimOnly}. Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'gauntlet':
      return [
        { text: 'Check first: Gauntlet\'s V1 vaults have been partly closed since 5 Nov 2026 (supply queues shut, no reopening date) — confirm the vault you want is still open for deposits before sending funds. Use a fresh wallet, seed offline', cost: 'no fee to check', time: '10 minutes' },
        { text: `Deposit $${capital} of USDC into a Gauntlet Prime vault on Morpho (e.g. USDC Prime, about 4.5% APY on Base) via the Gauntlet app or an embedder (Coinbase, Robinhood, Trezor); the yield is borrowing interest, not incentives`, cost: `$${capital} of capital and about $2–10 of gas (estimate)`, time: '15 minutes to set up' },
        { text: 'Gauntlet has no token (private company; SBI Holdings became a large strategic shareholder in Jul 2026) — farm the underlying vault yield, not a Gauntlet launch; do not confuse Aera\'s token with a Gauntlet token', cost: 'no fee to check', time: '10 minutes' },
        { text: `Hold at least ${hold} days; Frontier / high-yield vaults take mid-cap collateral, and liquidation can fail under stress — Prime vaults are the conservative choice`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: 'Check weekly whether the V1 closure has lifted and what the vault APY is; Gauntlet set no reopening date as of 15 Nov 2026', cost: 'no fee to check', time: '5 minutes a week' },
        { text: `${claimOnly}. Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'steakhouse-financial':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDC', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: `Deposit $${capital} into a Steakhouse Prime vault on Morpho (Prime USDC 4.5–6.5% APY target, 15–25% fee) or a High Yield, Term or Turbo vault, via the Steakhouse app or an embedder (Coinbase, Robinhood, Trezor)`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: 'Check the vault composition first (USDC/USDT/WETH/cbBTC): Prime vaults use blue-chip collateral, High Yield vaults take mid-cap collateral where liquidation can fail under stress', cost: 'no fee to check', time: '10 minutes' },
        { text: `Hold at least ${hold} days; Steakhouse has no token, so the return is borrowing interest — farm the vault yield, not a launch`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: 'Check monthly whether the curator has changed the vault allocation; Steakhouse vaults are also distributed inside other apps, so compare the fee where you deposit', cost: 'no fee to check', time: '10 minutes' },
        { text: `${claimOnly}. Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'keyrock':
      return [
        { text: 'There is no retail farm here: Keyrock is an institutional market maker (est. 2017, $1.1B valuation Mar 2026, 85+ exchanges, 400+ markets) with no retail product, no token and no points — watch only. Do not deposit anywhere claiming to be Keyrock retail', cost: 'nothing', time: '5 minutes' },
        { text: 'Watch for a change: check keyrock.com quarterly for a retail product or token announcement; that is the only event that would reopen this row', cost: 'nothing', time: '10 minutes, quarterly' },
        { text: 'Do not chase lookalike tokens: any "Keyrock" token on a DEX is unofficial — the firm has no token', cost: 'nothing', time: '5 minutes' },
        { text: 'If you want market-maker exposure generally, keep it in the venues Keyrock provides liquidity to, not in Keyrock itself — it takes no retail deposits', cost: 'nothing', time: '10 minutes' },
        { text: 'Re-check this verdict every quarter; a Series C firm can launch a retail arm, but none exists today', cost: 'nothing', time: '10 minutes, quarterly' },
        { text: 'Keep a one-line watch log (date, source, verdict) so the row is re-checked, not forgotten', cost: 'nothing', time: '5 minutes' },
      ];
    case 'tulipa-capital':
      return [
        { text: 'There is no retail farm here: Tulipa Capital is a boutique curator (since 2019, ex-prop fund) that works by institutional mandate, not self-serve deposits — watch only', cost: 'nothing', time: '5 minutes' },
        { text: 'The only indirect path: on app.lagoon.finance, look for a public vault whose curator is Tulipa; if one exists, follow the Lagoon plan (vault yield plus underlying rewards), not a Tulipa farm', cost: 'no fee to check', time: '15 minutes' },
        { text: 'If no Tulipa-curated public vault is listed, do nothing: there is no retail deposit route', cost: 'nothing', time: '5 minutes' },
        { text: 'Do not trust any "Tulipa token" or points offer: the firm has no token and no points program', cost: 'nothing', time: '5 minutes' },
        { text: 'Re-check quarterly on tulipa.capital and app.lagoon.finance for a public vault or retail product', cost: 'nothing', time: '10 minutes, quarterly' },
        { text: 'Keep a one-line watch log (date, source, verdict) so the row is re-checked, not forgotten', cost: 'nothing', time: '5 minutes' },
      ];
    case 'nonce-capital':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare ETH or USDC on Ethereum mainnet', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: 'Open ether.fi Liquid (or the Veda ecosystem page) and confirm the Nonce-curated vault (e.g. Liquid ETH vault) is still open; read its strategy note — the whole portfolio has run "bunker mode" conservative risk since early Oct 2026 (isolated collateral markets, minimal intermediaries)', cost: 'no fee to check', time: '15 minutes' },
        { text: `Deposit $${capital} of ETH or USDC, receive the Liquid vault share token and hold — the position accrues ether.fi membership points and Veda points at the same time`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: `Hold at least ${hold} days; check weekly whether Nonce has exited bunker mode (APY may rise when active strategies resume) and what the vault APY is`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: 'Note: Nonce itself has no points and no token — the points come from ether.fi and Veda, not from Nonce', cost: 'no fee to check', time: '5 minutes' },
        { text: `${claimOnly} (ether.fi / Veda links). Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'k3-capital':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDT or BOLD (by vault)', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: 'Open k3-capital.net, pick a vault (e.g. sBOLD or a USDT vault) and read the underlying protocol (Liquity v2, Morpho or Euler) and fees (about 10% performance fee); the sBOLD vault puts BOLD into the Liquity v2 stability pool for liquidation yield', cost: 'no fee to check', time: '15 minutes' },
        { text: `Deposit $${capital}, receive the vault shares and hold at least ${hold} days; the return is lending interest / liquidation yield — K3 has no token and no points (its FAQ says no publicly traded governance token)`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: 'Monad option: find a K3 vault on Morpho/Euler on Monad (K3 is Monad\'s largest curator) and deposit the same way, for gas under $0.10 per transaction (estimate)', cost: 'no fee to check', time: '15 minutes' },
        { text: 'Check the vault\'s underlying markets monthly; delta-neutral strategies can change collateral with market conditions', cost: 'no fee to check', time: '10 minutes a month' },
        { text: `${claimOnly} (k3-capital.net links). Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'clearstar':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDC on Base', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: 'Open app.morpho.org, search "Clearstar", and pick the cbAssets Vault (CSCBUSDC, 6.69% APY, 10% fee) or the USDC Reactor on Ethereum (6.89% net APY, 18% fee, 3-day timelock); read the fees before depositing', cost: 'no fee to check', time: '15 minutes' },
        { text: `Deposit $${capital} of USDC, receive the vault shares and hold at least ${hold} days; the return is lending interest — Clearstar has no points and no token`, cost: `$${capital} of capital and under $0.10 of gas per transaction (estimate)`, time: '15 minutes to set up' },
        { text: 'Mind the collateral: the High Yield USDC V2 vault holds SOL, JitoSOL, cbADA and cbDOGE, while the Reactor is blue-chip — pick one by risk appetite, not both', cost: 'no fee to check', time: '10 minutes' },
        { text: 'Note the 3-day timelock only gates parameter changes, not normal redemption — but check the vault\'s current timelock before depositing', cost: 'no fee to check', time: '5 minutes' },
        { text: `${claimOnly} (app.morpho.org links). Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'rockawayx':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDC', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: `Conservative route: on Ethereum, open app.morpho.org/vaults?curators=rockawayx and deposit $${capital} into USDC Prime (rxUSDCp, cbBTC/WBTC/wstETH collateral, 7-day timelock on parameter changes)`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: `Or Solana route: deposit $${capital} of USDC into the RockawayX RWA vault on Kamino ($41.9M, 4.8% APY; underlying OnRe, Huma and Figure markets)`, cost: `$${capital} of capital and under $0.05 of gas per transaction (estimate)`, time: '15 minutes to set up' },
        { text: `Hold at least ${hold} days; the return is lending interest / RWA yield — RockawayX has no points and no token`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: 'Check the underlying markets monthly (OnRe/Huma/Figure allocations change) and the vault\'s timelock before any move', cost: 'no fee to check', time: '10 minutes a month' },
        { text: `${claimOnly} (app.morpho.org / Kamino links). Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'hyperithm':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDC', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: `Simplest route: on Solana, deposit $${capital} of USDC into the Hyperithm USDC Apex Vault on Kamino (6.77% APY)`, cost: `$${capital} of capital and under $0.05 of gas per transaction (estimate)`, time: '15 minutes to set up' },
        { text: `Or on Ethereum, deposit $${capital} into the Hyperithm USDC vault on Morpho (10.54% APY)`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: 'Advanced, Monad only: deposit into the Hyperithm Monad vault for aHYPER shares, then post aHYPER as collateral on Monad Morpho to borrow USDC and loop — only if you understand looping, and keep the loop under 50% of principal (liquidation risk)', cost: 'under $0.10 of gas per transaction (estimate)', time: '20 minutes' },
        { text: `Hold at least ${hold} days; the return is lending interest — Hyperithm has no points and no token`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: `${claimOnly} (Kamino / app.morpho.org / YieldApp links). Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'gami-labs':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDC (Stellar for earnUSDC, or an EVM chain for gamiUSDC)', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: 'Open app.upshift.finance, find a Gami vault (e.g. earnUSDC on Stellar) and confirm on the Points page that Season 2 and the 5x boost (until $750M TVL) are still live', cost: 'no fee to check', time: '10 minutes' },
        { text: `Deposit $${capital} of USDC, hold the vault shares — the position earns vault APY plus Upshift points (1x, 5x before $750M TVL). Gami itself has no separate points or token`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: `Hold at least ${hold} days; check monthly whether Gami's underlying venues (Aave, Morpho, Curve, Pendle, Spectra) have changed materially`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: 'Note the flagships: gamiUSDC (14+ public vaults, $55M+ TVL) and the Coinshift Prime / High Yield co-branded vaults', cost: 'no fee to check', time: '10 minutes' },
        { text: `${claimOnly} (app.upshift.finance links). Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'galaxy-curation':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDC or WETH on Ethereum mainnet', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: 'Open app.morpho.org, search "Galaxy", and pick a Quality vault (capital-preserving, blue-chip collateral; Galaxy WETH Quality $4.97M, 2.72% APY) or an Enhanced vault (higher yield, wider collateral incl. LRTs, Pendle PTs, Ethena products)', cost: 'no fee to check', time: '15 minutes' },
        { text: `Deposit $${capital}, hold the vault shares at least ${hold} days; the return is lending interest — Galaxy Curator has no points and no token (Galaxy is a listed company)`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: 'Do not look for a Fireblocks account: Fireblocks Earn is the institutional channel for 2,400+ institutions — retail deposits go straight through the Morpho app', cost: 'no fee to check', time: '5 minutes' },
        { text: 'Read the fees and timelock on the chosen vault before depositing; Quality and Enhanced differ mainly in collateral, not in access', cost: 'no fee to check', time: '10 minutes' },
        { text: `${claimOnly} (app.morpho.org links). Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'armitage-by-wintermute':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDC on Ethereum mainnet', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: 'Open app.morpho.org, search "Armitage", and pick USDC Prime (blue-chip collateral, conservative) or USDC Select (adds vetted higher-yield markets); vaults are permissionless, non-custodial, no KYC; $145M+ deposited as of Oct 2026', cost: 'no fee to check', time: '15 minutes' },
        { text: `Deposit $${capital}, hold the vault shares at least ${hold} days; the return is lending interest — Armitage has no points and no token`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: 'Watch, do not pre-deposit: Armitage\'s WETH Yield on Railnet (target 3–4%) and later USDC Prime/Select there were announced 20 Oct 2026 — evaluate only after launch', cost: 'no fee to check', time: '10 minutes' },
        { text: 'Note the operator: Wintermute\'s on-chain curation arm (launched May 2026), run by its research head; the vaults, not the brand, are what you underwrite', cost: 'no fee to check', time: '5 minutes' },
        { text: `${claimOnly} (app.morpho.org / armitage.wintermute.com links). Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'shift-defi':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDC on Ethereum', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: `Provide $${capital} of liquidity to Shift DeFi's main vault on Ethereum and keep the position open; its strategies deposit into Curve and Morpho, so the yield is lending / pool yield`, cost: `$${capital} of capital and ${gasMain}`, time: '15 minutes to set up' },
        { text: 'Data note: the 7d +4,448% jump is adapter onboarding of institutional PYUSD/RLUSD vaults on 8 Nov 2026 (TVL $1.0M to $31.6M in a day), not organic growth — the model clamps it to +20% and gives it no extra weight', cost: 'no fee to check', time: '10 minutes' },
        { text: 'Check the protocol\'s own points or rewards page first: the snapshot records no points program, so if none exists this is a yield position, not a farm', cost: 'no fee to check', time: '10 minutes' },
        { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and hold the position for at least ${hold} days so the activity is counted in more than one snapshot`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: `${claimOnly}. Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'project-0':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare SOL or USDC on Solana', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: `Deposit $${capital} into Project 0's prime-brokerage margin account on Solana (one margin account, unified credit across Kamino and Jupiter Lend) and hold the position; no token has launched and no airdrop has happened`, cost: `$${capital} of capital and under $0.05 of gas per transaction (estimate)`, time: '15 minutes to set up' },
        { text: 'Data note: Project 0 is the former MarginFi; TVL is about 96% below its 2024 peak above $800M — judge it on the prime-broker thesis, not on TVL alone', cost: 'no fee to check', time: '10 minutes' },
        { text: 'Check the protocol\'s own points or rewards page first: the snapshot records no points program, so if none exists this is a yield position, not a farm', cost: 'no fee to check', time: '10 minutes' },
        { text: `Make one qualifying action each week, such as a deposit, a borrow or a swap, and hold the position for at least ${hold} days so the activity is counted in more than one snapshot`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: `${claimOnly}. Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    case 'current':
      return [
        { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and prepare USDC or SUI on Sui', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
        { text: `Deposit $${capital} of USDC or SUI into Current's isolated lending markets on Sui and hold; use the one-click Multiply feature for leveraged yield only if you understand liquidation risk in isolated markets`, cost: `$${capital} of capital and under $0.10 of gas per transaction (estimate)`, time: '15 minutes to set up' },
        { text: 'Current lists a points program in third-party comparisons (Oct 2026) — confirm the current points rules in the app before depositing, and treat points as unconfirmed until the app shows them', cost: 'no fee to check', time: '10 minutes' },
        { text: `Hold at least ${hold} days; Current is Sui's fastest-growing lender in 2026 (backed by Sui Foundation, OKX Ventures, Cetus and Bluefin) but TVL is $49.6M — small and young`, cost: `about $2 of gas a week; the $${capital} stays in the position`, time: `${hold} days` },
        { text: 'Make one qualifying action each week, such as a deposit, a borrow or a Multiply loop, so the activity is counted in more than one snapshot', cost: 'about $2 of gas a week', time: `${hold} days` },
        { text: `${claimOnly}. Write the wallet, the dates and every transaction in a farm log`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      ];
    default:
      return null;
  }
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * Derived from the protocol's own record (category, chains, TVL, age) plus
 * the published edge-case notes and the per-protocol verified plans above.
 * Where no live program exists the plan says so in step 1 instead of
 * inventing tasks.
 */
export function farmSteps(p: SnapshotProtocol, ageForModel: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(ageForModel);
  const specific = specificFarmSteps(p, capital, chain, hold);
  if (specific !== null) return specific;
  const noFarm = noFarmNote(p);
  const curator = p.category === 'Risk Curators';
  const action = noFarm !== null ? noFarmAction(p, capital, chain) : curator
    ? `Deposit $${capital} into a ${p.name} vault on ${chain} and keep the shares; the yield is borrowing interest, and the curator itself has no token to farm`
    : actionFor(p, capital, chain);
  const pointsStep = noFarm !== null
    ? 'Check the protocol\'s own page for the live position: there is no launch to farm on this row, so judge it on yield, not on points'
    : curator
      ? `Farm the underlying vaults, not the curator: check the vault's own points or rewards page on ${chain}, and treat the position as yield-only when the vault has no program`
      : `Open the protocol's own points or rewards page first: the snapshot records no points program, so if none exists this is a yield position, not a farm`;
  return [
    {
      text: noFarm !== null
        ? `${noFarm}. Start with a fresh wallet that holds only the funds you plan to use, and keep its seed phrase offline`
        : 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: pointsStep,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and hold the position for at least ${hold} days so the activity is counted in more than one snapshot`,
      cost: `about $2 of gas a week; the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes; never pay to claim, and never follow a claim link from a chat or an ad',
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it',
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    model: row.model,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const stats = categoryStats(snapshot);
  const validation = validateModel(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const watchlistSum = board.filter((r) => snapshot.watchlist.includes(r.slug)).reduce((n, r) => n + r.implied_value_usd, 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    watchlist_implied_sum_usd: watchlistSum,
    category_multiples: CATEGORY_MULTIPLES,
    fallback_multiple: FALLBACK_MULTIPLE,
    plausibility_rules: PLAUSIBILITY_RULES,
    token_exists: TOKEN_EXISTS_SLUGS,
    no_thesis: NO_THESIS_SLUGS,
    categories: [...stats.values()].sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0)),
    rows: board.map(radarRow),
    live,
    validation,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
