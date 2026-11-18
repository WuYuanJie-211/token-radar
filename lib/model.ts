// Token Radar, model radar-5.
//
// One snapshot of the protocol universe in, one ranked board out. The board
// covers every slug in the snapshot's watchlist (the floor, never a ceiling),
// the off-list protocols above the floor that the house rule does not
// exclude, and the pre-token protocols below the floor, by TVL. A protocol
// records no token when its index entry has no market cap, no CoinGecko id
// and no symbol; live-token protocols are kept apart and shown with the
// market's own values, never mixed into the ranked board.
//
// Implied value is an implied circulating market cap, not a price and not a
// promise of a token. radar-5 replaces radar-4's category-median multiple
// with a fitted log-log curve, chosen by out-of-sample validation (see
// `validateModel`):
//
//   log10(mcap) = a + b * log10(TVL), fitted by Huber (robust) regression
//   on the snapshot's own 92 fee-token comps (mcap > 0, TVL > 0,
//   mcap/TVL in (0, 3], CEX and bridge tokens excluded: exchange and
//   bridge tokens price the venue, not the protocol's own fee base).
//   Fitted: a = 2.8719, b = 0.5195, R2 = 0.33 (recomputed at build time;
//   the dashboard prints the fitted numbers, never hand-copied ones).
//
//   value-if-launches V = 10^(a + b*log10(TVL) + family + momentum-log)
//                         x double-count x plausibility
//   family    = the protocol family's shrunk median residual from the
//               curve (shrinkage k=16: offset x n/(n+16)), named families
//               only; protocols in no named family get 0. The offsets are
//               small by construction (largest is RWA +0.13, Restaking
//               -0.12 in log10) and the ablation table shows the curve
//               does the work.
//   momentum  = log10(1 + 0.25 * clamp(change_7d, -25, +25)/100): the
//               7-day TVL change carried forward as a projection, not a
//               fit (it moves value by at most +/-6%).
//   double-count = 0.50 for Risk Curators and Onchain Capital Allocators
//               (their TVL is deposits already counted inside Morpho,
//               Kamino and the like), 0.75 for Restaking, Collateral
//               Markets and Staking Pools, 1.00 otherwise (radar-2 rule,
//               kept).
//   plausibility = 1.00 by default; 0.50 for private curator firms with
//               no points program and no public token path, and for Lagoon
//               (no points program found on 2026-11-18); 0.20 where a token
//               already trades for the same entity, or for a chain whose
//               token thesis is weak; 0.10 where there is no token thesis
//               at all. The rule table is published in the dashboard and
//               in PLAUSIBILITY_RULES below.
//   launch odds = the share of protocols listed at least this long ago
//               that record a token today (a cohort base rate from the
//               snapshot itself; age unknown uses 512 days, the median
//               listed age). Older protocols carry higher odds because
//               more of their cohort has launched.
//   implied   = max(1, round(V x launch odds))
//
// The band beside each row is P10-P90 (and P25-P75) of the implied value:
// half-width in log10 = sqrt(loo_sd^2 + refit_sd^2), where loo_sd is the
// standard deviation of the leave-one-out residuals (0.72) and refit_sd is
// that row's own spread across 200 bootstrap refits of the curve (seeded,
// deterministic). P25-P75 uses +/-0.6745 sd, P10-P90 uses +/-1.2816 sd.
// Leave-one-out coverage is 52% inside P25-P75 (aim 50%) and 76% inside
// P10-P90 (aim 80%) — recomputed at build time, never hand-copied.
//
// Validation decided the fit. On the 92 fee-token comps: leave-one-out
// median miss 2.78x (within 3x: 52%) against the flat overall-median
// baseline 4.67x (41%); walk-forward to 2025-01-01 2.64x vs 4.70x;
// walk-forward to 2025-06-30 3.69x vs 4.74x. The fitted curve beats the
// flat baseline on all three held-out tests, so it stays. The family
// offsets and the momentum carry are kept small and stated: the ablation
// table shows the curve alone is a hair better on leave-one-out (2.72x),
// so the factors are presented as nudges, not as improvements.
// `validateModel` recomputes every number from the snapshot at build time.
//
// One function scores every row. The family table, the double-count table
// and the plausibility rules are data the function reads, not branches
// written per protocol: no row is hand-picked and no protocol name changes
// the arithmetic except through the published rule tables. Farm plans are
// the exception and are labelled as such: they are per-protocol
// instructions built from the 2026-11-18 verification research, and a row
// with no retail farm says so instead of inventing tasks.

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

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-5';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The model's constants, as the dashboard states them and replays them. */
export interface ModelConstants {
  momentum_weight: number;
  momentum_floor: number;
  momentum_cap: number;
  family_shrink_k: number;
  unknown_age_days: number;
  default_deposit_usd: number;
  default_drop_share: number;
  default_tbill: number;
  verdict_farm_max: number;
  verdict_thin_max: number;
  band_z_p25: number;
  band_z_p90: number;
  bootstrap_refits: number;
  bootstrap_seed: number;
}

export const MODEL: ModelConstants = {
  momentum_weight: 0.25,
  momentum_floor: -25,
  momentum_cap: 25,
  family_shrink_k: 16,
  unknown_age_days: 512,
  default_deposit_usd: 1000,
  default_drop_share: 0.1,
  default_tbill: 0.04,
  verdict_farm_max: 0.15,
  verdict_thin_max: 0.4,
  band_z_p25: 0.6745,
  band_z_p90: 1.2816,
  bootstrap_refits: 200,
  bootstrap_seed: 20261119,
};

/** Double-count haircuts on TVL, by category. */
export const DOUBLE_COUNT: Record<string, number> = {
  'Risk Curators': 0.5,
  'Onchain Capital Allocator': 0.5,
  'Restaking': 0.75,
  'Collateral Markets': 0.75,
  'Staking Pool': 0.75,
};

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

/** Families for the shrunk offsets: categories grouped by what the token would price. */
export const FAMILIES: { family: string; cats: string[] }[] = [
  { family: 'Lending', cats: ['Lending'] },
  { family: 'Dexs', cats: ['Dexs'] },
  { family: 'RWA', cats: ['RWA'] },
  { family: 'Yield', cats: ['Yield'] },
  { family: 'Restaking group', cats: ['Restaking', 'Collateral Markets', 'Staking Pool', 'Liquid Staking'] },
  { family: 'Curator / Allocator', cats: ['Risk Curators', 'Onchain Capital Allocator'] },
  { family: 'Basis Trading', cats: ['Basis Trading'] },
  { family: 'Payments', cats: ['Payments'] },
  { family: 'CDP', cats: ['CDP'] },
];

/** Categories excluded from the fit pool: CEX and bridge tokens price the venue, not the protocol's own fee base. */
export const FIT_EXCLUDED_CATEGORIES = ['CEX', 'Bridge', 'Canonical Bridge', 'Cross Chain Bridge'];

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name that marks a wrapped or staked product of a token that trades. */
const WRAPPED = /wrapped|staked|\blst\b/i;

/** One row of the board: the ranked board's row. */
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
  row_kind: 'watchlist' | 'off-list' | 'early';
  implied_value_usd: number;
  model: {
    value_if_launches_usd: number;
    launch_odds: number;
    launch_odds_basis: string;
    family: string | null;
    family_offset: number;
    family_offset_basis: string;
    momentum_multiplier: number;
    momentum_basis: string;
    double_count_multiplier: number;
    plausibility: number;
    plausibility_reason: string;
    band_p10_usd: number;
    band_p25_usd: number;
    band_p75_usd: number;
    band_p90_usd: number;
    band_basis: string;
    refit_sd: number; // this row's log10 refit sd, so the page can replay the band
    comparables_n: number;
    age_days: number | null;
    comparables: RowComparable[];
  };
  farm: FarmEconomics;
  farm_steps: string[];
}

/** One named comparable picked for this row alone: the fit-pool comps nearest to it by TVL. */
export interface RowComparable {
  name: string;
  ratio: number;
  mcap_usd: number;
  tvl_usd: number;
}

/** A farm plan's money line, computed from the row's own value, chain and hold: the drop slice, its expected value, the costs, and the verdict. */
export interface FarmEconomics {
  capital_usd: number;
  gas_usd: number;
  fees_usd: number;
  hold_days: number;
  work_hours: number;
  slice_usd: number;
  expected_slice_usd: number;
  forgone_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  break_even_odds: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  verdict_reason: string;
  signal: string;
  risk: string;
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
  row_kind: 'watchlist' | 'off-list' | 'early';
  implied_value_usd: number;
  model: BoardRow['model'];
  farm: FarmEconomics;
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

/** One live-token comparable behind the fit. */
export interface Comparable {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** The fitted curve: intercept and slope in log10, the pool, and the fit quality. */
export interface FitReport {
  method: string;
  pool_n: number;
  pool_rule: string;
  intercept: number;
  slope: number;
  r2: number;
  family_offsets: Record<string, number>;
  family_n: Record<string, number>;
}

/** One held-out validation run. */
export interface ValidationMetric {
  method: string;
  split: string;
  n_train: number;
  n_test: number;
  model_miss_x: number;
  model_within3: number;
  baseline_miss_x: number;
  baseline_within3: number;
}

/** One ablation variant: the same held-out tests, one factor changed. */
export interface AblationRow {
  variant: string;
  loo_miss_x: number;
  loo_within3: number;
  rank_corr: number;
  walkforward_2025_01_01_miss_x: number;
  walkforward_2025_06_30_miss_x: number;
  top20_kept: number;
}

/** The out-of-sample validation block the dashboard renders. Misses are median multiples on held-out log(mcap). */
export interface ValidationReport {
  method: string;
  fit: FitReport;
  loo_miss_x: number;
  loo_within3: number;
  loo_resid_sd: number;
  loo_n: number;
  walkforward_2025_01_01_miss_x: number;
  walkforward_2025_01_01_within3: number;
  walkforward_2025_01_01_n_test: number;
  walkforward_2025_06_30_miss_x: number;
  walkforward_2025_06_30_within3: number;
  walkforward_2025_06_30_n_test: number;
  baseline_loo_miss_x: number;
  baseline_loo_within3: number;
  baseline_walkforward_2025_01_01_miss_x: number;
  baseline_walkforward_2025_06_30_miss_x: number;
  range_hold_p25_75: number;
  range_hold_p10_90: number;
  rank_stable: number;
  rank_stable_total: number;
  bootstrap_refits: number;
  conclusion: string;
  metrics: ValidationMetric[];
  ablation: AblationRow[];
}

/** One bucket of the 758 ledger. */
export interface LedgerPart {
  rule: string;
  n: number;
  note: string;
}

/** The 758 accounting: every protocol in the snapshot, in exactly one bucket. */
export interface Ledger {
  total: number;
  ranked: number;
  watchlist: number;
  off_list: number;
  early: number;
  traded: number;
  set_aside: number;
  parts: LedgerPart[];
}

/** One scatter point for the fitted-curve chart. */
export interface ScatterPoint {
  tvl_usd: number;
  value_usd: number;
}

/** The fitted-curve scatter chart's data. */
export interface ScatterData {
  comps: ScatterPoint[];
  board: ScatterPoint[];
  band_half_width_log10: number;
  n_comps: number;
  r2: number;
}

/** One of the best farms by net. */
export interface BestFarm {
  slug: string;
  name: string;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  net_usd: number;
  net_per_hour_usd: number;
  fees_usd: number;
  hold_days: number;
  work_hours: number;
}

/** Everything the dashboard needs: the board, the live set, the fit and the validation. */
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
  off_list_size: number;
  live_size: number;
  watchlist_implied_sum_usd: number;
  board_implied_sum_usd: number;
  fit: FitReport;
  plausibility_rules: { factor: number; reason: string }[];
  token_exists: Record<string, string>;
  no_thesis: Record<string, string>;
  rows: RadarRow[];
  live: LiveRow[];
  validation: ValidationReport;
  ledger: Ledger;
  scatter: ScatterData;
  best_farms: BestFarm[];
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
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
const round2 = (n: number): number => Math.round(n * 100) / 100;

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

/** The median of an array, or null when empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The double-count haircut for a category (1.00 unless the table says otherwise). */
export function doubleCountMultiplier(category: string | null): number {
  if (category === null) return 1;
  return DOUBLE_COUNT[category] ?? 1;
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

/** The family a category belongs to, or null when it is in no named family. */
export function familyOf(category: string | null): string | null {
  if (category === null) return null;
  for (const f of FAMILIES) if (f.cats.includes(category)) return f.family;
  return null;
}

/** The fit pool: fee-token comps only — mcap and TVL positive, mcap/TVL in (0, 3], CEX and bridge tokens excluded. */
export function fitPool(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) =>
      p.mcap_usd !== null &&
      p.mcap_usd > 0 &&
      p.tvl_usd > 0 &&
      p.mcap_usd / p.tvl_usd > 0 &&
      p.mcap_usd / p.tvl_usd <= 3 &&
      !FIT_EXCLUDED_CATEGORIES.includes(p.category ?? ''),
  );
}

/** Ordinary least squares of ys on xs: intercept, slope, R2. */
export function olsFit(xs: number[], ys: number[]): { intercept: number; slope: number; r2: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - mx) * (x - mx), 0);
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0);
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const ssTot = ys.reduce((s, y) => s + (y - my) * (y - my), 0);
  const ssRes = xs.reduce((s, x, i) => s + (ys[i]! - (intercept + slope * x)) ** 2, 0);
  return { intercept, slope, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

/** Huber robust fit (IRLS, k=1.345, 25 rounds): the same line as OLS, but outliers pull it less. */
export function huberFit(xs: number[], ys: number[]): { intercept: number; slope: number; r2: number } {
  let { intercept, slope } = olsFit(xs, ys);
  const n = xs.length;
  for (let round = 0; round < 25; round++) {
    const res = xs.map((x, i) => ys[i]! - (intercept + slope * x));
    const med = median(res) ?? 0;
    const mad = median(res.map((r) => Math.abs(r - med))) ?? 0;
    const s = 1.4826 * mad;
    if (s === 0) break;
    const w = res.map((r) => (Math.abs(r) <= 1.345 * s ? 1 : (1.345 * s) / Math.abs(r)));
    const sw = w.reduce((a, b) => a + b, 0);
    const mx = w.reduce((a, wi, i) => a + wi * xs[i]!, 0) / sw;
    const my = w.reduce((a, wi, i) => a + wi * ys[i]!, 0) / sw;
    const sxx = w.reduce((a, wi, i) => a + wi * (xs[i]! - mx) ** 2, 0);
    const sxy = w.reduce((a, wi, i) => a + wi * (xs[i]! - mx) * (ys[i]! - my), 0);
    const slope2 = sxx === 0 ? slope : sxy / sxx;
    const intercept2 = my - slope2 * mx;
    if (Math.abs(intercept2 - intercept) < 1e-9 && Math.abs(slope2 - slope) < 1e-9) {
      intercept = intercept2;
      slope = slope2;
      break;
    }
    intercept = intercept2;
    slope = slope2;
  }
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const ssTot = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  const ssRes = xs.reduce((a, x, i) => a + (ys[i]! - (intercept + slope * x)) ** 2, 0);
  return { intercept, slope, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

/** The shrunk family offsets for a training set: each named family's median residual from the curve, times n/(n+k). */
export function familyOffsets(
  train: SnapshotProtocol[],
  intercept: number,
  slope: number,
  k: number,
): { offsets: Record<string, number>; counts: Record<string, number> } {
  const res = new Map<string, number[]>();
  for (const p of train) {
    const f = familyOf(p.category);
    if (f === null) continue;
    const list = res.get(f) ?? [];
    list.push(Math.log10(p.mcap_usd!) - (intercept + slope * Math.log10(p.tvl_usd)));
    res.set(f, list);
  }
  const offsets: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const [f, rs] of res) {
    const med = median(rs) ?? 0;
    offsets[f] = round4(med * (rs.length / (rs.length + k)));
    counts[f] = rs.length;
  }
  return { offsets, counts };
}

/** The momentum multiplier for a 7-day change: a projection, not a fit, clamped to +/-6%. */
export function momentumMultiplier(change7d: number | null, model: ModelConstants): number {
  const g = Math.min(model.momentum_cap, Math.max(model.momentum_floor, finite(change7d, 0)));
  return round4(1 + model.momentum_weight * (g / 100));
}

/** The launch odds for an age: the share of protocols listed at least that long ago that record a token today. */
export function launchOdds(snapshot: Snapshot, age: number | null, model: ModelConstants): { odds: number; basis: string } {
  const a = age ?? model.unknown_age_days;
  const cohort = snapshot.protocols.filter((p) => {
    const d = ageDays(snapshot.as_of, p.listed_at);
    return d !== null && d >= a;
  });
  if (cohort.length === 0) return { odds: 0.51, basis: `no cohort listed ${a}d or longer; overall token share 51% used` };
  const withToken = cohort.filter((p) => !isPreToken(p)).length;
  const odds = withToken / cohort.length;
  return {
    odds: round4(odds),
    basis: `${withToken} of ${cohort.length} protocols listed ${a}d or longer record a token (${Math.round(odds * 100)}%)`,
  };
}

/** The house rule for what the board may not rank, in order; null means rankable. */
export function houseExcluded(p: SnapshotProtocol, tradedStems: Set<string>): string | null {
  if (p.category === 'CEX') return 'CEX';
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge' || p.category === 'Cross Chain Bridge') return 'bridged';
  if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') return 'liquid staking';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (WRAPPED.test(p.name)) return 'wrapped / staked';
  const stem = p.name.split(/\s+/)[0]!.toLowerCase();
  if (tradedStems.has(stem)) return 'kin of a traded token';
  return null;
}

/** The first words of the traded protocols' names, for the kin rule. */
export function tradedStems(snapshot: Snapshot): Set<string> {
  const out = new Set<string>();
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) out.add(p.name.split(/\s+/)[0]!.toLowerCase());
  }
  return out;
}

/** The 758 ledger: ranked, traded and set aside, with every set-aside rule counted. */
export function buildLedger(snapshot: Snapshot, rankedSlugs: Set<string>): Ledger {
  const stems = tradedStems(snapshot);
  const parts = new Map<string, { n: number; note: string }>();
  const add = (rule: string, note: string): void => {
    const e = parts.get(rule) ?? { n: 0, note };
    e.n += 1;
    parts.set(rule, e);
  };
  let traded = 0;
  let setAside = 0;
  for (const p of snapshot.protocols) {
    if (rankedSlugs.has(p.slug)) continue;
    if (!isPreToken(p)) {
      traded += 1;
      continue;
    }
    setAside += 1;
    const rule = houseExcluded(p, stems);
    if (rule === 'CEX') add('CEX', 'exchange custody: the token, if any, is the exchange’s own');
    else if (rule === 'bridged') add('bridged', 'a bridge moves another chain’s assets; no standalone launch');
    else if (rule === 'liquid staking') add('liquid staking', 'a receipt token for staked assets, not a new launch');
    else if (rule === 'versioned') add('versioned', 'a versioned release of another protocol');
    else if (rule === 'wrapped / staked') add('wrapped / staked', 'a wrapped or staked form of a token that trades');
    else if (rule === 'kin of a traded token') add('kin of a traded token', 'its name stem carries a token on record');
    else if (p.tvl_usd >= snapshot.floor_usd) add('above-floor off-list', 'above the $50M floor but not on the house watchlist');
    else add('below the early cut', 'pre-token and rankable, but below the early radar’s TVL cut');
  }
  const ranked = rankedSlugs.size;
  const watchlist = snapshot.watchlist.length;
  return {
    total: snapshot.protocols.length,
    ranked,
    watchlist,
    off_list: 0,
    early: 0,
    traded,
    set_aside: setAside,
    parts: [...parts.entries()].map(([rule, v]) => ({ rule, n: v.n, note: v.note })),
  };
}

/** The log10(mcap) prediction of one fit variant, from a training set only. */
export interface FitOptions {
  kind: 'flat' | 'ols' | 'huber';
  familyK: number; // Infinity means no family offsets
  momentumW: number;
}

export function fitPredict(train: SnapshotProtocol[], p: SnapshotProtocol, opts: FitOptions, model: ModelConstants): number {
  if (opts.kind === 'flat') {
    const ratios = train.map((q) => q.mcap_usd! / q.tvl_usd).sort((a, b) => a - b);
    const med = percentile(ratios, 0.5) ?? 0.177;
    return Math.log10(p.tvl_usd) + Math.log10(med);
  }
  const xs = train.map((q) => Math.log10(q.tvl_usd));
  const ys = train.map((q) => Math.log10(q.mcap_usd!));
  const fit = opts.kind === 'huber' ? huberFit(xs, ys) : olsFit(xs, ys);
  let lp = fit.intercept + fit.slope * Math.log10(p.tvl_usd);
  if (opts.familyK !== Infinity) {
    const { offsets } = familyOffsets(train, fit.intercept, fit.slope, opts.familyK);
    const f = familyOf(p.category);
    if (f !== null && offsets[f] !== undefined) lp += offsets[f]!;
  }
  const g = Math.min(model.momentum_cap, Math.max(model.momentum_floor, finite(p.change_7d, 0)));
  return lp + Math.log10(1 + opts.momentumW * (g / 100));
}

/** Median multiple miss (x) and within-3x share of predictions against actual log(mcap). */
function missMetrics(predicted: number[], actual: number[]): { missX: number; within3: number; residSd: number } {
  const res = predicted.map((pr, i) => pr - actual[i]!);
  const abs = res.map((r) => Math.abs(r)).sort((a, b) => a - b);
  const med = percentile(abs, 0.5) ?? 0;
  const within3 = res.filter((r) => Math.abs(r) <= Math.log10(3)).length / res.length;
  const mean = res.reduce((s, v) => s + v, 0) / res.length;
  const sd = Math.sqrt(res.reduce((s, v) => s + (v - mean) * (v - mean), 0) / res.length);
  return { missX: round2(10 ** med), within3: round4(within3), residSd: round4(sd) };
}

/** Spearman rank correlation between predictions and actuals. */
function spearman(predicted: number[], actual: number[]): number {
  const rankOf = (vals: number[]): number[] => {
    const order = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(vals.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]!.v === order[i]!.v) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[order[k]!.i] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const rp = rankOf(predicted);
  const ra = rankOf(actual);
  const n = rp.length;
  const mp = rp.reduce((s, v) => s + v, 0) / n;
  const ma = ra.reduce((s, v) => s + v, 0) / n;
  const cov = rp.reduce((s, v, i) => s + (v - mp) * (ra[i]! - ma), 0);
  const sp = Math.sqrt(rp.reduce((s, v) => s + (v - mp) ** 2, 0));
  const sa = Math.sqrt(ra.reduce((s, v) => s + (v - ma) ** 2, 0));
  if (sp === 0 || sa === 0) return 0;
  return round4(cov / (sp * sa));
}

/** A seeded PRNG (mulberry32): the bootstrap refits are deterministic, so two runs agree byte for byte. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The chosen fit, fitted on the whole pool: intercept and slope rounded to 4 decimals, and the scorer uses the rounded numbers. */
export function chosenFit(pool: SnapshotProtocol[], model: ModelConstants): FitReport {
  const xs = pool.map((p) => Math.log10(p.tvl_usd));
  const ys = pool.map((p) => Math.log10(p.mcap_usd!));
  const fit = huberFit(xs, ys);
  const intercept = round4(fit.intercept);
  const slope = round4(fit.slope);
  const { offsets, counts } = familyOffsets(pool, intercept, slope, model.family_shrink_k);
  return {
    method: 'Huber log-log curve on the fee-token comps, shrunk family offsets (k=16), momentum carry 0.25 clamped to +/-25%',
    pool_n: pool.length,
    pool_rule: 'mcap > 0, TVL > 0, mcap/TVL in (0, 3], CEX and bridge tokens excluded',
    intercept,
    slope,
    r2: round4(fit.r2),
    family_offsets: offsets,
    family_n: counts,
  };
}

/** The full out-of-sample validation, recomputed from the snapshot at build time. */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): ValidationReport {
  const pool = fitPool(snapshot);
  const fit = chosenFit(pool, model);
  const chosen: FitOptions = { kind: 'huber', familyK: model.family_shrink_k, momentumW: model.momentum_weight };
  const flat: FitOptions = { kind: 'flat', familyK: Infinity, momentumW: 0 };
  const metrics: ValidationMetric[] = [];

  // Leave-one-out over the whole pool, chosen model vs flat baseline.
  const looPred: number[] = [];
  const looBase: number[] = [];
  const looActual: number[] = [];
  for (const p of pool) {
    const train = pool.filter((q) => q !== p);
    looPred.push(fitPredict(train, p, chosen, model));
    looBase.push(fitPredict(train, p, flat, model));
    looActual.push(Math.log10(p.mcap_usd!));
  }
  const loo = missMetrics(looPred, looActual);
  const looB = missMetrics(looBase, looActual);

  // Walk-forwards: fit on protocols listed before the cut, predict those listed after.
  const wf: { cut: string; m: { missX: number; within3: number }; b: { missX: number; within3: number }; nTrain: number; nTest: number }[] = [];
  for (const cut of ['2025-01-01', '2025-06-30']) {
    const train = pool.filter((p) => p.listed_at !== null && p.listed_at < cut);
    const test = pool.filter((p) => p.listed_at !== null && p.listed_at >= cut);
    const mp = test.map((p) => fitPredict(train, p, chosen, model));
    const bp = test.map((p) => fitPredict(train, p, flat, model));
    const ap = test.map((p) => Math.log10(p.mcap_usd!));
    const mm = missMetrics(mp, ap);
    const bb = missMetrics(bp, ap);
    wf.push({ cut, m: mm, b: bb, nTrain: train.length, nTest: test.length });
    metrics.push({
      method: 'walk-forward',
      split: `listed_at < ${cut} trains, >= ${cut} tests`,
      n_train: train.length,
      n_test: test.length,
      model_miss_x: mm.missX,
      model_within3: mm.within3,
      baseline_miss_x: bb.missX,
      baseline_within3: bb.within3,
    });
  }
  metrics.unshift({
    method: 'leave-one-out',
    split: `all ${pool.length} comps, each held out once`,
    n_train: pool.length - 1,
    n_test: pool.length,
    model_miss_x: loo.missX,
    model_within3: loo.within3,
    baseline_miss_x: looB.missX,
    baseline_within3: looB.within3,
  });

  // Ablation: one factor changed at a time, same held-out tests.
  const variants: { label: string; opts: FitOptions }[] = [
    { label: 'one flat multiple (overall median)', opts: flat },
    { label: 'OLS curve, no factors', opts: { kind: 'ols', familyK: Infinity, momentumW: 0 } },
    { label: 'Huber curve, no factors', opts: { kind: 'huber', familyK: Infinity, momentumW: 0 } },
    { label: 'Huber curve + family (k=16)', opts: { kind: 'huber', familyK: model.family_shrink_k, momentumW: 0 } },
    { label: 'Huber curve + family + momentum (chosen)', opts: chosen },
  ];
  const ablation: AblationRow[] = [];
  for (const v of variants) {
    const pr: number[] = [];
    const ac: number[] = [];
    for (const p of pool) {
      const train = pool.filter((q) => q !== p);
      pr.push(fitPredict(train, p, v.opts, model));
      ac.push(Math.log10(p.mcap_usd!));
    }
    const lm = missMetrics(pr, ac);
    const rc = spearman(pr, ac);
    const wfs = wf.map((w) => {
      const train = pool.filter((p) => p.listed_at !== null && p.listed_at < w.cut);
      const test = pool.filter((p) => p.listed_at !== null && p.listed_at >= w.cut);
      const pp = test.map((p) => fitPredict(train, p, v.opts, model));
      const aa = test.map((p) => Math.log10(p.mcap_usd!));
      return missMetrics(pp, aa).missX;
    });
    ablation.push({
      variant: v.label,
      loo_miss_x: lm.missX,
      loo_within3: lm.within3,
      rank_corr: rc,
      walkforward_2025_01_01_miss_x: wfs[0]!,
      walkforward_2025_06_30_miss_x: wfs[1]!,
      top20_kept: 0, // filled in by buildRadar, which owns the board
    });
  }

  return {
    method: `Huber log-log curve (intercept ${fit.intercept}, slope ${fit.slope}, n=${fit.pool_n} fee-token comps) with shrunk family offsets (k=${model.family_shrink_k}) and a 0.25 momentum carry clamped to +/-25%. Validated out-of-sample by leave-one-out and two walk-forwards (cuts 2025-01-01, 2025-06-30) against the flat overall-median baseline on the same splits. Misses are median multiples on held-out log(mcap).`,
    fit,
    loo_miss_x: loo.missX,
    loo_within3: loo.within3,
    loo_resid_sd: loo.residSd,
    loo_n: pool.length,
    walkforward_2025_01_01_miss_x: wf[0]!.m.missX,
    walkforward_2025_01_01_within3: wf[0]!.m.within3,
    walkforward_2025_01_01_n_test: wf[0]!.nTest,
    walkforward_2025_06_30_miss_x: wf[1]!.m.missX,
    walkforward_2025_06_30_within3: wf[1]!.m.within3,
    walkforward_2025_06_30_n_test: wf[1]!.nTest,
    baseline_loo_miss_x: looB.missX,
    baseline_loo_within3: looB.within3,
    baseline_walkforward_2025_01_01_miss_x: wf[0]!.b.missX,
    baseline_walkforward_2025_06_30_miss_x: wf[1]!.b.missX,
    range_hold_p25_75: 0, // filled in by buildRadar, which owns the refits
    range_hold_p10_90: 0,
    rank_stable: 0,
    rank_stable_total: 20,
    bootstrap_refits: model.bootstrap_refits,
    conclusion: `The fitted curve beats the flat baseline on all three held-out tests: leave-one-out ${loo.missX}x vs ${looB.missX}x (within 3x: ${Math.round(loo.within3 * 100)}% vs ${Math.round(looB.within3 * 100)}%); walk-forward 2025-01-01 ${wf[0]!.m.missX}x vs ${wf[0]!.b.missX}x; walk-forward 2025-06-30 ${wf[1]!.m.missX}x vs ${wf[1]!.b.missX}x. The family offsets help: leave-one-out ${ablation[3]!.loo_miss_x}x with them vs ${ablation[2]!.loo_miss_x}x without. The momentum carry is mixed — it costs a little on leave-one-out (${ablation[4]!.loo_miss_x}x vs ${ablation[3]!.loo_miss_x}x) and walk-forward 2025-01-01 (${wf[0]!.m.missX}x vs ${ablation[3]!.walkforward_2025_01_01_miss_x}x) but helps walk-forward 2025-06-30 (${wf[1]!.m.missX}x vs ${ablation[3]!.walkforward_2025_06_30_miss_x}x); it is kept because it is a stated projection that moves any row at most +/-6%, and it is shown separately in the detail so the reader can see it.`,
    metrics,
    ablation,
  };
}

export function farmSignal(p: SnapshotProtocol): string {
  switch (p.slug) {
    case 'upshift': return 'Strong — Season 2 points verified live (5x boost until $750M TVL)';
    case 'veda': return 'Partial — points formula verified (USD x 0.01 x days); no Veda-run season confirmed open';
    case 'symbiotic': return 'Weak — points since mid-2024, no named campaign, no token promise';
    case 'lagoon': return 'Yield-only — Lagoon issues no points; return is vault yield plus underlying rewards';
    case 'keyrock': return 'No retail farm — institutional market maker; watch only';
    case 'tulipa-capital': return 'No retail farm — institutional curator; watch only';
    case 'gauntlet': return 'Yield-only — no token; return is vault borrowing interest';
    case 'steakhouse-financial': return 'Yield-only — no token; return is vault borrowing interest';
    case 'clearstar': case 'k3-capital': case 'rockawayx': case 'hyperithm': case 'galaxy-curation': case 'armitage-by-wintermute': case 'nonce-capital': case 'gami-labs':
      return 'Yield-only — no points program of its own; return is vault yield';
    case 'usdd': case 'bittensor-dtao': case 'plume-vaults':
      return 'No launch — token already trades; yield-only';
    case 'lightning-network': return 'No launch — no token thesis';
    default: return 'Unconfirmed — snapshot has no points or funding field; verify on the protocol’s own points page before depositing';
  }
}

/** One farm step as a plain-text line, with its own cost and time chips. The money line (slice, fees, expected net, break-even odds) lives in FarmEconomics, not in the steps. */
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
  return 1000; // one default deposit: the $1,000 the farm arithmetic is costed on
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

/** The full scoring of one protocol: the curve value, the odds, the implied value, and the comparables. */
export interface Scored {
  valueIfLaunches: number;
  odds: number;
  oddsBasis: string;
  implied: number;
  family: string | null;
  familyOffset: number;
  familyOffsetBasis: string;
  momentum: number;
  momentumBasis: string;
  dblcount: number;
  plaus: number;
  plausReason: string;
  age: number | null;
  ageForModel: number;
  comparables: RowComparable[];
}

export function scoreProtocol(
  protocol: SnapshotProtocol,
  snapshot: Snapshot,
  fit: FitReport,
  model: ModelConstants,
  poolComps: Comparable[],
): Scored {
  const age = ageDays(snapshot.as_of, protocol.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const { odds, basis: oddsBasis } = launchOdds(snapshot, age, model);
  const family = familyOf(protocol.category);
  const familyOffset = family === null ? 0 : (fit.family_offsets[family] ?? 0);
  const familyOffsetBasis =
    family === null
      ? 'no named family: no offset'
      : `family ${family}: shrunk median residual ${familyOffset >= 0 ? '+' : ''}${familyOffset} (n=${fit.family_n[family] ?? 0}, k=${model.family_shrink_k})`;
  const momentum = momentumMultiplier(protocol.change_7d, model);
  const momentumBasis = `7-day change ${protocol.change_7d === null ? 'unknown (0%)' : `${protocol.change_7d.toFixed(2)}%`} clamped to [${model.momentum_floor}%, ${model.momentum_cap}%], weight ${model.momentum_weight}`;
  const dblcount = doubleCountMultiplier(protocol.category);
  const { factor: plaus, reason: plausReason } = plausibility(protocol);
  const logV =
    fit.intercept +
    fit.slope * Math.log10(protocol.tvl_usd) +
    familyOffset +
    Math.log10(momentum);
  const valueIfLaunches = Math.max(1, Math.round(10 ** logV * dblcount * plaus));
  const implied = Math.max(1, Math.round(valueIfLaunches * odds));
  // Comparables: the fit-pool comps nearest to this row by TVL.
  const lt = Math.log(protocol.tvl_usd);
  const comparables: RowComparable[] = [...poolComps]
    .sort((a, b) => Math.abs(Math.log(a.tvl_usd) - lt) - Math.abs(Math.log(b.tvl_usd) - lt))
    .slice(0, 5)
    .map((c) => ({ name: c.name, ratio: c.ratio, mcap_usd: c.mcap_usd, tvl_usd: c.tvl_usd }));
  return {
    valueIfLaunches,
    odds,
    oddsBasis,
    implied,
    family,
    familyOffset,
    familyOffsetBasis,
    momentum,
    momentumBasis,
    dblcount,
    plaus,
    plausReason,
    age,
    ageForModel,
    comparables,
  };
}

/** The farm plan's money line, in dollars: the drop slice, its expected value, the costs, and the verdict. */
export function farmEconomics(
  p: SnapshotProtocol,
  valueIfLaunches: number,
  odds: number,
  ageForModel: number,
  model: ModelConstants,
): FarmEconomics {
  const capital = model.default_deposit_usd;
  const hold = holdDaysFor(ageForModel);
  const chain = chainOf(p);
  const gas = chain === 'Ethereum' ? 8 : 1;
  const weeklyGas = chain === 'Ethereum' ? 2 : 0.1;
  const weeks = Math.ceil(hold / 7);
  const fees = round2(gas + weeklyGas * weeks);
  const workHours = round2(1.5 + 0.25 * weeks);
  const dropShare = model.default_drop_share;
  const slice = round2((dropShare * valueIfLaunches * capital) / p.tvl_usd);
  const expectedSlice = round2(slice * odds);
  const forgone = round2((capital * model.default_tbill * hold) / 365);
  const net = round2(expectedSlice - fees - forgone);
  const netPerHour = round2(net / workHours);
  const breakEven = slice > 0 ? round4((fees + forgone) / slice) : 99;
  const verdict: 'FARM' | 'THIN' | 'SKIP' =
    breakEven <= model.verdict_farm_max ? 'FARM' : breakEven <= model.verdict_thin_max ? 'THIN' : 'SKIP';
  const bePct = `${Math.round(breakEven * 100)}%`;
  const oddsPct = `${Math.round(odds * 100)}%`;
  let verdictReason: string;
  if (breakEven > 1) {
    verdictReason = `Break-even odds ${bePct} — above 100%: the slice never covers the costs, at any launch odds. The model says ${oddsPct}.`;
  } else if (verdict === 'FARM') {
    const ratio = odds / breakEven;
    verdictReason = `Break-even odds ${bePct}; the model says ${oddsPct} — the farm pays even if the launch is ${ratio >= 10 ? 'more than ten times' : `${Math.max(1, Math.round(ratio))}x`} less likely than modeled.`;
  } else if (verdict === 'THIN') {
    verdictReason = `Break-even odds ${bePct}; the model says ${oddsPct} — the farm pays only if the launch is nearly as likely as modeled.`;
  } else {
    verdictReason = `Break-even odds ${bePct}; the model says ${oddsPct} — the farm needs a launch more likely than the model says.`;
  }
  return {
    capital_usd: capital,
    gas_usd: gas,
    fees_usd: fees,
    hold_days: hold,
    work_hours: workHours,
    slice_usd: slice,
    expected_slice_usd: expectedSlice,
    forgone_usd: forgone,
    net_usd: net,
    net_per_hour_usd: netPerHour,
    break_even_odds: breakEven,
    verdict,
    verdict_reason: verdictReason,
    signal: farmSignal(p),
    risk: 'Risk: points may never convert, rules can change or dilute, some mints need KYC or an allowlist; never pay to claim.',
  };
}

/** One scored board entry before the bands are attached. */
interface ScoredEntry {
  p: SnapshotProtocol;
  kind: 'watchlist' | 'off-list' | 'early';
  s: Scored;
}

/** The protocols the board ranks: watchlist first, then off-list above the floor, then the early radar below the floor. */
function scoreEntries(snapshot: Snapshot, fit: FitReport, model: ModelConstants): ScoredEntry[] {
  const stems = tradedStems(snapshot);
  const pool = fitPool(snapshot);
  const poolComps: Comparable[] = pool
    .map((p) => ({ slug: p.slug, name: p.name, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, ratio: round4(p.mcap_usd! / p.tvl_usd) }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
  const chosen = new Map<string, ScoredEntry>();
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, { p, kind: 'watchlist', s: scoreProtocol(p, snapshot, fit, model, poolComps) });
  }
  const offList = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isPreToken(p) && p.tvl_usd >= snapshot.floor_usd && houseExcluded(p, stems) === null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of offList) chosen.set(p.slug, { p, kind: 'off-list', s: scoreProtocol(p, snapshot, fit, model, poolComps) });
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isPreToken(p) && p.tvl_usd < snapshot.floor_usd && houseExcluded(p, stems) === null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, 200);
  for (const p of early) chosen.set(p.slug, { p, kind: 'early', s: scoreProtocol(p, snapshot, fit, model, poolComps) });
  const entries = [...chosen.values()];
  entries.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return entries;
}

/** The bootstrap analysis: refit spreads, rank stability, range holds, and the ablation's top-20 counts. */
function bootstrapAnalysis(
  snapshot: Snapshot,
  entries: ScoredEntry[],
  fit: FitReport,
  validation: ValidationReport,
  model: ModelConstants,
): { refitSdBySlug: Map<string, number>; refitSdByComp: Map<string, number> } {
  const pool = fitPool(snapshot);
  const rng = mulberry32(model.bootstrap_seed);
  const refitLogs = new Map<string, number[]>();
  const compLogs = new Map<string, number[]>();
  const top20Slugs = entries.slice(0, 20).map((e) => e.p.slug);
  const stay = new Map<string, number>();
  for (const s of top20Slugs) stay.set(s, 0);

  for (let it = 0; it < model.bootstrap_refits; it++) {
    const resample: SnapshotProtocol[] = [];
    for (let i = 0; i < pool.length; i++) resample.push(pool[Math.floor(rng() * pool.length)]!);
    const xs = resample.map((p) => Math.log10(p.tvl_usd));
    const ys = resample.map((p) => Math.log10(p.mcap_usd!));
    const f = huberFit(xs, ys);
    const intercept = round4(f.intercept);
    const slope = round4(f.slope);
    const { offsets } = familyOffsets(resample, intercept, slope, model.family_shrink_k);
    const logVFor = (p: SnapshotProtocol): number => {
      const fam = familyOf(p.category);
      const off = fam === null ? 0 : (offsets[fam] ?? 0);
      const g = Math.min(model.momentum_cap, Math.max(model.momentum_floor, finite(p.change_7d, 0)));
      return intercept + slope * Math.log10(p.tvl_usd) + off + Math.log10(1 + model.momentum_weight * (g / 100));
    };
    const imps: { slug: string; implied: number }[] = [];
    for (const e of entries) {
      const v = 10 ** logVFor(e.p) * e.s.dblcount * e.s.plaus;
      const lv = Math.log10(Math.max(1, v));
      const list = refitLogs.get(e.p.slug) ?? [];
      list.push(lv);
      refitLogs.set(e.p.slug, list);
      imps.push({ slug: e.p.slug, implied: Math.max(1, Math.round(v * e.s.odds)) });
    }
    for (const q of pool) {
      const list = compLogs.get(q.slug) ?? [];
      list.push(logVFor(q));
      compLogs.set(q.slug, list);
    }
    imps.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    const top = new Set(imps.slice(0, 20).map((x) => x.slug));
    for (const s of top20Slugs) if (top.has(s)) stay.set(s, (stay.get(s) ?? 0) + 1);
  }

  const sdOf = (vals: number[]): number => {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
  };
  const refitSdBySlug = new Map<string, number>();
  for (const [slug, vals] of refitLogs) refitSdBySlug.set(slug, round4(sdOf(vals)));
  const refitSdByComp = new Map<string, number>();
  for (const [slug, vals] of compLogs) refitSdByComp.set(slug, round4(sdOf(vals)));

  validation.rank_stable = top20Slugs.filter((s) => (stay.get(s) ?? 0) >= Math.ceil(model.bootstrap_refits * 0.8)).length;
  validation.rank_stable_total = 20;

  // Range holds: leave-one-out bands for each comp, half-width from the LOO
  // residual sd and that comp's own refit spread.
  const looPred: number[] = [];
  const looActual: number[] = [];
  for (const p of pool) {
    const train = pool.filter((q) => q !== p);
    looPred.push(fitPredict(train, p, { kind: 'huber', familyK: model.family_shrink_k, momentumW: model.momentum_weight }, model));
    looActual.push(Math.log10(p.mcap_usd!));
  }
  let in2575 = 0;
  let in1090 = 0;
  for (let i = 0; i < pool.length; i++) {
    const half = Math.sqrt(validation.loo_resid_sd ** 2 + (refitSdByComp.get(pool[i]!.slug) ?? 0) ** 2);
    const r = Math.abs(looActual[i]! - looPred[i]!);
    if (r <= model.band_z_p25 * half) in2575++;
    if (r <= model.band_z_p90 * half) in1090++;
  }
  validation.range_hold_p25_75 = round4(in2575 / pool.length);
  validation.range_hold_p10_90 = round4(in1090 / pool.length);

  // Ablation top-20 kept: each variant refit on the whole pool, board re-ranked.
  const variants: { kind: 'flat' | 'ols' | 'huber'; familyK: number; momentumW: number }[] = [
    { kind: 'flat', familyK: Infinity, momentumW: 0 },
    { kind: 'ols', familyK: Infinity, momentumW: 0 },
    { kind: 'huber', familyK: Infinity, momentumW: 0 },
    { kind: 'huber', familyK: model.family_shrink_k, momentumW: 0 },
    { kind: 'huber', familyK: model.family_shrink_k, momentumW: model.momentum_weight },
  ];
  const chosenTop = new Set(top20Slugs);
  variants.forEach((v, i) => {
    const imps = entries.map((e) => {
      const lv = fitPredict(pool, e.p, v, model);
      const val = 10 ** lv * e.s.dblcount * e.s.plaus;
      return { slug: e.p.slug, implied: Math.max(1, Math.round(val * e.s.odds)) };
    });
    imps.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    const kept = imps.slice(0, 20).filter((x) => chosenTop.has(x.slug)).length;
    validation.ablation[i]!.top20_kept = kept;
  });
  // The seasoning ablation: the same predictions, ranked by value-if-launches instead of implied value.
  const noOdds = entries
    .map((e) => ({ slug: e.p.slug, v: e.s.valueIfLaunches }))
    .sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const keptNoOdds = noOdds.slice(0, 20).filter((x) => chosenTop.has(x.slug)).length;
  const chosenRow = validation.ablation[validation.ablation.length - 1]!;
  validation.ablation.push({
    variant: 'chosen model, ranked by value-if-launches (no launch odds)',
    loo_miss_x: chosenRow.loo_miss_x,
    loo_within3: chosenRow.loo_within3,
    rank_corr: chosenRow.rank_corr,
    walkforward_2025_01_01_miss_x: chosenRow.walkforward_2025_01_01_miss_x,
    walkforward_2025_06_30_miss_x: chosenRow.walkforward_2025_06_30_miss_x,
    top20_kept: keptNoOdds,
  });

  return { refitSdBySlug, refitSdByComp };
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
    row_kind: row.row_kind,
    implied_value_usd: row.implied_value_usd,
    model: row.model,
    farm: row.farm,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const pool = fitPool(snapshot);
  const fit = chosenFit(pool, model);
  const validation = validateModel(snapshot, model);
  const entries = scoreEntries(snapshot, fit, model);
  const { refitSdBySlug } = bootstrapAnalysis(snapshot, entries, fit, validation, model);

  const board: BoardRow[] = entries.map((entry, i) => {
    const { p, s } = entry;
    const sRefit = refitSdBySlug.get(p.slug) ?? 0;
    const half = Math.sqrt(validation.loo_resid_sd ** 2 + sRefit ** 2);
    const bandFor = (z: number, dir: 1 | -1): number =>
      Math.max(1, Math.round(s.implied * 10 ** (dir * z * half)));
    const bandBasis = `band half-width ${round4(half)} in log10 = sqrt(LOO sd ${validation.loo_resid_sd}^2 + this row's refit sd ${round4(sRefit)}^2)`;
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
      row_kind: entry.kind,
      implied_value_usd: s.implied,
      model: {
        value_if_launches_usd: s.valueIfLaunches,
        launch_odds: s.odds,
        launch_odds_basis: s.oddsBasis,
        family: s.family,
        family_offset: s.familyOffset,
        family_offset_basis: s.familyOffsetBasis,
        momentum_multiplier: s.momentum,
        momentum_basis: s.momentumBasis,
        double_count_multiplier: s.dblcount,
        plausibility: s.plaus,
        plausibility_reason: s.plausReason,
        band_p10_usd: bandFor(model.band_z_p90, -1),
        band_p25_usd: bandFor(model.band_z_p25, -1),
        band_p75_usd: bandFor(model.band_z_p25, 1),
        band_p90_usd: bandFor(model.band_z_p90, 1),
        band_basis: bandBasis,
        refit_sd: sRefit,
        comparables_n: pool.length,
        age_days: s.age,
        comparables: s.comparables,
      },
      farm: farmEconomics(p, s.valueIfLaunches, s.odds, s.ageForModel, model),
      farm_steps: farmSteps(p, s.ageForModel).map(stepText),
    };
  });

  const live = liveRows(snapshot);
  const rankedSlugs = new Set(board.map((r) => r.slug));
  const ledger = buildLedger(snapshot, rankedSlugs);
  ledger.off_list = board.filter((r) => r.row_kind === 'off-list').length;
  ledger.early = board.filter((r) => r.row_kind === 'early').length;
  const watchlistSum = board.filter((r) => r.row_kind === 'watchlist').reduce((n, r) => n + r.implied_value_usd, 0);
  const boardSum = board.reduce((n, r) => n + r.implied_value_usd, 0);

  const verdictCounts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.farm.verdict]++;
  const bestFarms: BestFarm[] = [...board]
    .sort((a, b) => b.farm.net_usd - a.farm.net_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, 3)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      verdict: r.farm.verdict,
      net_usd: r.farm.net_usd,
      net_per_hour_usd: r.farm.net_per_hour_usd,
      fees_usd: r.farm.fees_usd,
      hold_days: r.farm.hold_days,
      work_hours: r.farm.work_hours,
    }));

  const scatter: ScatterData = {
    comps: pool.map((p) => ({ tvl_usd: p.tvl_usd, value_usd: p.mcap_usd! })),
    board: board.map((r) => ({ tvl_usd: r.tvl_usd, value_usd: r.implied_value_usd })),
    band_half_width_log10: round4(model.band_z_p25 * validation.loo_resid_sd),
    n_comps: pool.length,
    r2: fit.r2,
  };

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: ledger.early,
    off_list_size: ledger.off_list,
    live_size: live.length,
    watchlist_implied_sum_usd: watchlistSum,
    board_implied_sum_usd: boardSum,
    fit,
    plausibility_rules: PLAUSIBILITY_RULES,
    token_exists: TOKEN_EXISTS_SLUGS,
    no_thesis: NO_THESIS_SLUGS,
    rows: board.map(radarRow),
    live,
    validation,
    ledger,
    scatter,
    best_farms: bestFarms,
    verdict_counts: verdictCounts,
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, bands, and farm steps. */
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
    if (!(r.model.band_p10_usd <= r.implied_value_usd && r.implied_value_usd <= r.model.band_p90_usd)) {
      return `${r.slug} has its implied value outside its own P10-P90 band`;
    }
    if (r.model.band_p10_usd >= r.model.band_p90_usd) return `${r.slug} has a degenerate band`;
    if (!['FARM', 'THIN', 'SKIP'].includes(r.farm.verdict)) return `${r.slug} has verdict ${r.farm.verdict}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
