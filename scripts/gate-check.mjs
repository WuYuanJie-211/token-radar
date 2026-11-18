// Local mirror of the sealed token-radar-01 gate (7 rows), run against a
// built output directory. Read-only; exits 1 on the first failure, 0 when
// every row passes. Node 22 stdlib only.
//
//   node scripts/gate-check.mjs [out-dir] [snapshot.json]
//   defaults: out, ../token-radar-01-kit/input/snapshot.json

import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const outDir = process.argv[2] ?? 'out';
const snapshotPath = process.argv[3] ?? '../token-radar-01-kit/input/snapshot.json';

let failures = 0;
function check(name, ok, detail) {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) failures++;
}

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const snapSlugs = new Set(snapshot.protocols.map((p) => p.slug));

// ---- 1. dashboard files -------------------------------------------------
const dashDir = join(outDir, 'dashboard');
const dashFiles = [];
(function walk(dir, rel) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name.startsWith('.')) check('dashboard: no dot-directory', false, p);
      walk(join(dir, e.name), p);
    } else if (e.isFile()) {
      dashFiles.push({ path: p, size: lstatSync(join(dir, p)).size });
    }
  }
})(dashDir, '');
const dashBytes = dashFiles.reduce((n, f) => n + f.size, 0);
check('dashboard: index.html + css + js present',
  existsSync(join(dashDir, 'index.html')) && dashFiles.some((f) => f.path.endsWith('.css')) && dashFiles.some((f) => f.path.endsWith('.js')),
  `${dashFiles.length} files, ${dashBytes} bytes`);
check('dashboard: <=400 files, <=4 MiB', dashFiles.length <= 400 && dashBytes <= 4_194_304);
check('dashboard: source <64 KiB (judge reads it whole)', dashBytes < 65_536, `${dashBytes} bytes`);
const NAME_OK = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
check('dashboard: file names valid', dashFiles.every((f) => f.path.split('/').every((part) => NAME_OK.test(part))));
// No http(s) in HTML attribute values, <style> bodies, CSS files, or JS
// import/export/require/dynamic-import. Visible text may carry URLs; this
// check is stricter and also refuses them in code, which is fine: the
// dashboard carries no URLs at all.
let netLeak = null;
for (const f of dashFiles) {
  const text = readFileSync(join(dashDir, f.path), 'utf8');
  if (f.path.endsWith('.css') && /https?:\/\//.test(text)) netLeak = `${f.path}: URL in CSS`;
  if (f.path.endsWith('.js') && /(import\s*\(|from\s+['"]https?:|require\(\s*['"]https?:|import\s+['"]https?:)/.test(text)) netLeak = `${f.path}: network import`;
  if (f.path.endsWith('.html')) {
    const attrs = text.match(/<[^>]+>/g) ?? [];
    for (const tag of attrs) {
      const vals = tag.match(/=\s*"[^"]*https?:\/\/[^"]*"/g) ?? [];
      if (vals.length > 0) netLeak = `${f.path}: URL in attribute ${vals[0]}`;
    }
    if (/<style[^>]*>[\s\S]*?https?:\/\//.test(text)) netLeak = `${f.path}: URL in <style>`;
  }
}
check('dashboard: no network references', netLeak === null, netLeak ?? 'no http(s) in attributes, CSS or JS imports');

// ---- 2. board file -------------------------------------------------------
const boardPath = join(outDir, 'board.json');
const boardBytes = statSync(boardPath).size;
const boardDoc = JSON.parse(readFileSync(boardPath, 'utf8'));
const rows = Array.isArray(boardDoc) ? boardDoc : boardDoc.rows;
check('board: 100-4000 rows, file <=8 MiB', rows.length >= 100 && rows.length <= 4000 && boardBytes <= 8_388_608, `${rows.length} rows, ${boardBytes} bytes`);
const slugs = rows.map((r) => r.slug);
check('board: slugs unique, 1-128 chars, no whitespace, in snapshot',
  new Set(slugs).size === slugs.length && slugs.every((s) => typeof s === 'string' && s.length >= 1 && s.length <= 128 && !/\s/.test(s) && snapSlugs.has(s)));
check('board: ranks exactly 1..N in array order',
  rows.every((r, i) => r.rank === i + 1));
check('board: implied_value_usd positive whole $, <=1e14, non-increasing with rank',
  rows.every((r) => Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 1e14)
  && rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd),
  `top ${rows[0]?.implied_value_usd}, bottom ${rows[rows.length - 1]?.implied_value_usd}`);
check('board: not all identical implied values', new Set(rows.map((r) => r.implied_value_usd)).size >= 2);
const missing = snapshot.watchlist.filter((s) => !new Set(slugs).has(s));
check('board: all 40 watchlist slugs present', missing.length === 0, missing.length > 0 ? `missing ${missing.join(', ')}` : '40/40');
const outside = rows.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
check('board: >=60 rows outside watchlist', outside >= 60, `${outside} outside`);
let stepBad = null;
for (const r of rows) {
  const steps = r.farm_steps;
  if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) { stepBad = `${r.slug}: ${steps?.length} steps`; break; }
  for (const s of steps) {
    const t = s.trim();
    if (t.length < 20 || t.length > 600) { stepBad = `${r.slug}: step of ${t.length} trimmed chars`; break; }
  }
  if (stepBad) break;
}
check('board: farm_steps 3-12 x 20-600 trimmed chars', stepBad === null, stepBad ?? `${rows.length} rows x 6 steps`);
check('board: every row has a name', rows.every((r) => typeof r.name === 'string' && r.name.length > 0));

// ---- 3. screenshots ------------------------------------------------------
const shotDir = join(outDir, 'screenshots');
const shots = readdirSync(shotDir).filter((n) => !n.startsWith('.')).sort();
function pngSize(buf) {
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}
check('screenshots: 3-4 images', shots.length >= 3 && shots.length <= 4, `${shots.length} images: ${shots.join(', ')}`);
let shotBad = null;
for (const name of shots) {
  const buf = readFileSync(join(shotDir, name));
  const size = pngSize(buf) ?? jpegSize(buf);
  if (size === null) { shotBad = `${name}: not a whole PNG or JPEG`; break; }
  if (buf.length > 524_288) { shotBad = `${name}: ${buf.length} bytes over 512 KiB`; break; }
  const long = Math.max(size.w, size.h);
  const short = Math.min(size.w, size.h);
  if (long > 1440 || short < 800) { shotBad = `${name}: ${size.w}x${size.h} (long ${long}, short ${short})`; break; }
}
check('screenshots: each <=512 KiB, whole PNG/JPEG, long <=1440, short >=800', shotBad === null, shotBad ?? shots.map((n) => `${n} ${statSync(join(shotDir, n)).size}B`).join(', '));

// ---- 4. dossier matches --------------------------------------------------
const dossierPath = join(outDir, 'dossier.json');
const dossierBytes = readFileSync(dossierPath);
const rebuilt = buildDossier(outDir, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
check('dossier: byte-for-byte what buildDossier writes',
  Buffer.compare(Buffer.from(dossierBytes), Buffer.from(rebuilt)) === 0,
  `${dossierBytes.length} bytes on disk vs ${rebuilt.length} rebuilt`);
check('dossier: <=1.5 MiB', dossierBytes.length <= 1_572_864, `${dossierBytes.length} bytes`);

// ---- 5. dashboard data agrees with the board ----------------------------
const dataJs = readFileSync(join(outDir, 'data.js'), 'utf8');
const dataMatch = dataJs.match(/^window\.RADAR=(\{.*\});\n$/s);
let dataOk = false;
let dataDetail = 'data.js does not parse as window.RADAR={...}';
if (dataMatch) {
  try {
    const radar = JSON.parse(dataMatch[1]);
    dataOk = radar.rows.length === rows.length
      && radar.rows.every((dr, i) => dr.slug === rows[i].slug && dr.implied_value_usd === rows[i].implied_value_usd)
      && radar.model_version === 'radar-5';
    dataDetail = dataOk ? `${radar.rows.length} rows, model ${radar.model_version}` : 'data.js rows disagree with board.json';
  } catch (e) {
    dataDetail = `data.js JSON parse failed: ${e.message}`;
  }
}
check('data.js: rows agree with board.json, model radar-5', dataOk, dataDetail);

process.stdout.write(failures === 0 ? 'gate-check: ALL PASS\n' : `gate-check: ${failures} FAILURE${failures === 1 ? '' : 'S'}\n`);
process.exit(failures === 0 ? 0 : 1);
