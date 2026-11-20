// Writes examples/synthetic-snapshot.json.
// SYNTHETIC fixture only. Names and figures are invented.
// This file is not imported by main.ts and does not change the scorer.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const families = [
  ['Lending', 0.15],
  ['Dexs', 0.3],
  ['RWA', 0.25],
  ['Yield', 0.18],
  ['Restaking', 0.04],
  ['Risk Curators', 0.02],
  ['Basis Trading', 0.4],
  ['Payments', 0.2],
  ['CDP', 0.16],
  ['Liquid Staking', 0.03],
];

const protocols = [];

for (let i = 0; i < 30; i++) {
  const [category, ratio] = families[i % families.length];
  const tvl = 5_000_000 + i * 7_000_000;
  const listed = i < 10 ? '2024-06-01' : i < 20 ? '2025-03-15' : '2025-08-01';
  protocols.push({
    slug: `feecomp-${String(i + 1).padStart(2, '0')}`,
    name: `Feecomp ${category} ${i + 1}`,
    category,
    chains: i % 2 === 0 ? ['Ethereum'] : ['Solana'],
    tvl_usd: tvl,
    change_7d: ((i % 7) - 3) * 1.5,
    mcap_usd: Math.round(tvl * ratio),
    listed_at: listed,
    gecko_id: `feecomp-${i + 1}`,
    symbol: `FC${i + 1}`,
  });
}

protocols.push({
  slug: 'feecomp-outlier',
  name: 'Feecomp Outlier',
  category: 'Lending',
  chains: ['Ethereum'],
  tvl_usd: 10_000_000,
  change_7d: 1,
  mcap_usd: 40_000_000,
  listed_at: '2024-01-01',
  gecko_id: 'feecomp-outlier',
  symbol: 'OUT',
});

const watchCategories = [
  'RWA',
  'Lending',
  'Risk Curators',
  'Onchain Capital Allocator',
  'Yield',
  'Basis Trading',
  'Chain',
  'CDP',
  'Payments',
  'Dexs',
];
const watchlist = [];
for (let i = 0; i < 40; i++) {
  const slug = `proto-watch-${String(i + 1).padStart(2, '0')}`;
  watchlist.push(slug);
  protocols.push({
    slug,
    name: `Proto Watch ${i + 1}`,
    category: watchCategories[i % watchCategories.length],
    chains: i % 3 === 0 ? ['Ethereum'] : i % 3 === 1 ? ['Solana'] : ['Ethereum', 'Base'],
    tvl_usd: 51_000_000 + (40 - i) * 1_000_000,
    change_7d: ((i % 9) - 4) * 2,
    mcap_usd: null,
    listed_at: i === 0 ? null : i % 2 === 0 ? '2024-02-01' : '2025-09-01',
    gecko_id: null,
    symbol: null,
  });
}

for (let i = 0; i < 15; i++) {
  protocols.push({
    slug: `proto-off-${String(i + 1).padStart(2, '0')}`,
    name: `Proto Off ${i + 1}`,
    category: i % 2 === 0 ? 'RWA' : 'Yield',
    chains: ['Polygon'],
    tvl_usd: 60_000_000 + i * 500_000,
    change_7d: 1,
    mcap_usd: null,
    listed_at: '2025-04-01',
    gecko_id: null,
    symbol: null,
  });
}

for (let i = 0; i < 70; i++) {
  protocols.push({
    slug: `proto-early-${String(i + 1).padStart(2, '0')}`,
    name: `Proto Early ${i + 1}`,
    category: ['Lending', 'RWA', 'Yield', 'Dexs'][i % 4],
    chains: ['Base'],
    tvl_usd: 49_000_000 - i * 100_000,
    change_7d: 0,
    mcap_usd: null,
    listed_at: '2025-07-01',
    gecko_id: null,
    symbol: null,
  });
}

protocols.push(
  {
    slug: 'proto-cex',
    name: 'Proto Exchange',
    category: 'CEX',
    chains: ['Ethereum'],
    tvl_usd: 80_000_000,
    change_7d: 0,
    mcap_usd: null,
    listed_at: '2024-01-01',
    gecko_id: null,
    symbol: null,
  },
  {
    slug: 'proto-bridge',
    name: 'Proto Bridge',
    category: 'Bridge',
    chains: ['Ethereum'],
    tvl_usd: 70_000_000,
    change_7d: 0,
    mcap_usd: null,
    listed_at: '2024-01-01',
    gecko_id: null,
    symbol: null,
  },
  {
    slug: 'proto-versioned',
    name: 'Proto Versioned V2',
    category: 'Lending',
    chains: ['Ethereum'],
    tvl_usd: 40_000_000,
    change_7d: 0,
    mcap_usd: null,
    listed_at: '2024-01-01',
    gecko_id: null,
    symbol: null,
  },
);

const snapshot = {
  note: 'SYNTHETIC fixture. Not a DefiLlama snapshot. Every name and figure is invented so the documented commands can be run without the external snapshot.',
  as_of: '2026-01-15',
  source: 'SYNTHETIC fixture — not DefiLlama',
  floor_usd: 50_000_000,
  protocols,
  watchlist,
};

const out = join(dirname(fileURLToPath(import.meta.url)), 'synthetic-snapshot.json');
writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
process.stdout.write(`wrote ${out} (${protocols.length} protocols, ${watchlist.length} watchlist)\n`);
