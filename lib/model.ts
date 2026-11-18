// Token Radar, model radar-2.
//
// One snapshot of the protocol universe in, one ranked board out. The board
// covers every slug in the snapshot's watchlist (the floor, never a ceiling)
// and adds pre-token protocols below the watchlist floor, by TVL. A protocol
// records no token when its index entry has no market cap, no CoinGecko id
// and no symbol; live-token protocols are kept apart and shown with the
// market's own values, never mixed into the ranked board.
//
// Implied value is an implied circulating market cap, not a price and not a
// promise of a token: the value the protocol would carry if it traded today
// at its category's median market-cap-to-TVL ratio, adjusted for growth,
// maturity, chain breadth, double-counted TVL and token plausibility.
//
//   multiple   = M_cat, the category's winsorised median mcap/TVL from the
//                snapshot itself (ratios outside (0, 3] dropped); where a
//                category has too few live-token comps the table below says
//                so and names the judgemental multiple or fallback used.
//   growth     = clamp(change_7d, -20, +20); a 7-day window is mostly price
//                movement, so it may move value by at most +/-10%.
//   growthMult = 1 + 0.5 * growth / 100
//   maturity   = 0.6 + 0.4 * min(age_days, 1095) / 1095; age unknown -> 512d,
//                the median listed age in the snapshot.
//   chain      = 1.00 (1 chain) / 1.05 (2-3) / 1.10 (4-9) / 1.15 (10+)
//   dblcount   = 0.50 for Risk Curators and Onchain Capital Allocators
//                (their TVL is deposits already counted inside Morpho,
//                Kamino and the like), 0.75 for Restaking, Collateral
//                Markets and Staking Pools (restaked assets counted twice),
//                1.00 otherwise.
//   plaus      = 1.00 by default; 0.50 for private curator firms with no
//                points program and no public token path; 0.20 where a
//                token already trades for the same entity, or for a chain
//                whose token thesis is weak; 0.10 where there is no token
//                thesis at all. The rule table is published in the
//                dashboard and in PLAUSIBILITY_RULES below.
//   implied    = max(1, round(TVL * M_cat * growthMult * maturity
//                      * chain * dblcount * plaus))
//
// The fully-diluted range shown beside each row is implied * [2, 4]: the
// snapshot carries no supply data, so no FDV multiple can be measured from
// it, and the range is a secondary line only, never the headline number.
// The p25/p75 range is the same computation with the category's p25/p75
// mcap/TVL in place of its median, shown only where the category has at
// least four live-token comps.
//
// One function scores every row. The category table, the double-count
// table and the plausibility rules are data the function reads, not
// branches written per protocol: no row is hand-picked and no protocol
// name changes the arithmetic except through the published rule tables.

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
 * Category multiples M_cat. Winsorised medians are computed from the
 * snapshot's own live-token comps (mcap/TVL, ratios outside (0, 3] dropped);
 * the judgemental entries are the methodology's disclosed calls: the Risk
 * Curators comp (api3, an oracle, ratio 2.975) is rejected, the Onchain
 * Capital Allocator raw median (0.006) is rejected as too low for a fee
 * token, the Staking Pool raw median (0.002) is floored at 0.020, and the
 * Chain sole comp (astar, 3.026) is rejected. Categories with no comps at
 * all fall back to the overall winsorised median, 0.169.
 */
export const CATEGORY_MULTIPLES: Record<string, CategoryMultiple> = {
  'Lending': { multiple: 0.129, basis: 'winsorised median, n=13 live comps', confidence: 'high' },
  'CDP': { multiple: 0.169, basis: 'winsorised median, n=3 live comps', confidence: 'medium' },
  'Dexs': { multiple: 0.293, basis: 'winsorised median, n=9 live comps', confidence: 'high' },
  'Yield': { multiple: 0.145, basis: 'winsorised median, n=9 live comps', confidence: 'medium' },
  'RWA': { multiple: 0.275, basis: 'winsorised median, n=9 live comps', confidence: 'high' },
  'Restaking': { multiple: 0.025, basis: 'winsorised median, n=2 live comps (Eigen 0.032, Babylon 0.017)', confidence: 'medium' },
  'Collateral Markets': { multiple: 0.025, basis: 'restaking group median; no direct comps', confidence: 'low' },
  'Staking Pool': { multiple: 0.02, basis: 'raw median 0.002 floored at 0.020 (judgemental)', confidence: 'low' },
  'Basis Trading': { multiple: 0.31, basis: 'winsorised median, n=6 live comps', confidence: 'high' },
  'Payments': { multiple: 0.181, basis: 'winsorised median, n=2 live comps', confidence: 'medium' },
  'Risk Curators': { multiple: 0.05, basis: 'judgemental; sole comp api3 (2.975, an oracle) rejected', confidence: 'low' },
  'Onchain Capital Allocator': { multiple: 0.05, basis: 'judgemental; raw median 0.006 rejected as too low for a fee token', confidence: 'low' },
  'Chain': { multiple: 0.25, basis: 'judgemental; sole comp astar (3.026) rejected', confidence: 'low' },
  'CeDeFi': { multiple: 0.169, basis: 'overall median fallback; no comps', confidence: 'low' },
  'Insurance': { multiple: 0.169, basis: 'overall median fallback; no comps', confidence: 'low' },
  'Governance Incentives': { multiple: 0.169, basis: 'overall median fallback; no comps', confidence: 'low' },
  'Stablecoin Wrapper': { multiple: 0.169, basis: 'overall median fallback; no comps', confidence: 'low' },
};

/** The fallback for a category the table does not list: the overall winsorised median. */
export const FALLBACK_MULTIPLE: CategoryMultiple = {
  multiple: 0.169,
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

/**
 * Plausibility rules, in the order they are applied (first match wins).
 * Each rule is a verifiable fact, not a judgement of quality:
 *  - token-exists: a token already trades for the same entity, so there is
 *    no new launch to value (USDD stablecoin trades; TAO trades and dTAO
 *    is its subnet market; PLUME had its TGE in Jan 2025; MEZO was
 *    distributed in the Jan 2026 Bitget campaign).
 *  - no-thesis: the Lightning Network is a Bitcoin payment network with no
 *    token and no token thesis.
 *  - chain-weak: chain tokens for appchains with a weak token thesis.
 *  - curator-private: private curator firms with no points program and no
 *    public token path found in research.
 * Anything else scores 1.00: a public deposit product with a plausible
 * token path. The rules are published in the dashboard's model section.
 */
export const PLAUSIBILITY_RULES: { factor: number; reason: string }[] = [
  { factor: 0.2, reason: 'a token already trades for this entity, so there is no new launch to value' },
  { factor: 0.1, reason: 'no token and no token thesis (a payment network, not a token launch)' },
  { factor: 0.2, reason: 'chain-token thesis is weak for this appchain' },
  { factor: 0.5, reason: 'private curator firm; no points program and no public token path found' },
];

/** Slugs where a token already trades for the same entity (plausibility 0.20). */
export const TOKEN_EXISTS_SLUGS: Record<string, string> = {
  'usdd': 'USDD stablecoin already trades (TRON DAO Reserve; governance via JST, not a new token)',
  'bittensor-dtao': 'TAO already trades; dTAO is the subnet-alpha market, not a new token',
  'plume-vaults': 'PLUME already trades (TGE Jan 2025); vaults are a product of the chain',
  'mezo-earn': 'MEZO was already distributed in campaigns (Bitget, Jan 2026); mats are activity points',
};

/** The one no-thesis row (plausibility 0.10). */
export const NO_THESIS_SLUGS: Record<string, string> = {
  'lightning-network': 'Bitcoin payment network; no token, no token thesis',
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
export const MODEL_VERSION = 'radar-2';

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

/** Everything the dashboard needs: the board, the live set, the model tables and the comps. */
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
 * then a weak chain-token thesis, then a private curator firm, else 1.00.
 */
export function plausibility(protocol: SnapshotProtocol): { factor: number; reason: string } {
  const tokenNote = TOKEN_EXISTS_SLUGS[protocol.slug];
  if (tokenNote !== undefined) return { factor: 0.2, reason: tokenNote };
  const thesisNote = NO_THESIS_SLUGS[protocol.slug];
  if (thesisNote !== undefined) return { factor: 0.1, reason: thesisNote };
  if (protocol.category === 'Chain') {
    return { factor: 0.2, reason: 'Chain category: the token thesis for an appchain is weak, and the chain itself is the product' };
  }
  if (protocol.category === 'Risk Curators') {
    return { factor: 0.5, reason: 'Private curator firm; no points program and no public token path found in research' };
  }
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
 * a symbol but no market cap, so they never enter the pool.
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
}

export function scoreProtocol(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  stats: Map<string, CategoryStats>,
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
  const multiple = categoryMultiple(protocol.category);
  const base = protocol.tvl_usd * multiple.multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult * dblcount * plaus));
  const catStats = stats.get(protocol.category ?? 'Other');
  const compN = catStats?.n ?? 0;
  const compMedian = catStats?.median ?? null;
  let rangeLow: number | null = null;
  let rangeHigh: number | null = null;
  if (catStats !== undefined && compN >= model.range_min_comps && catStats.p25 !== null && catStats.p75 !== null) {
    const rest = growthMult * maturityMult * chainMult * dblcount * plaus;
    rangeLow = Math.max(1, Math.round(protocol.tvl_usd * catStats.p25 * rest));
    rangeHigh = Math.max(1, Math.round(protocol.tvl_usd * catStats.p75 * rest));
  }
  return { implied, growthPct, growthMult, maturityMult, chainMult, dblcount, plaus, plausReason, multiple, age, ageForModel, rangeLow, rangeHigh, compN, compMedian };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
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

  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, model, stats) }));
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
      return 'There is no live farm here: Plume Points Season 2 is closed (points earning ended 31 Mar 2026, registration closed 27 May 2026)';
    case 'mezo-earn':
      return 'There is no new launch to farm here: MEZO was already distributed in campaigns, so farm mats and MUSD yield instead of an airdrop';
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
    case 'mezo-earn':
      return `Deposit $${capital} of tBTC or WBTC into Mezo Earn on ${chain} and borrow a small amount of MUSD against it to earn mats`;
    case 'lightning-network':
      return `Open a Lightning channel with $${capital} of BTC, keep the node online, and earn routing fees on forwarded payments`;
    default:
      return actionFor(p, capital, chain);
  }
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * Derived from the protocol's own record (category, chains, TVL, age) plus
 * the published edge-case notes above. Where no live program exists the
 * plan says so in step 1 instead of inventing tasks.
 */
export function farmSteps(p: SnapshotProtocol, ageForModel: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(ageForModel);
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
