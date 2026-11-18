// Token Radar dashboard (radar-5). Reads window.RADAR, written beside
// dashboard/ by main.ts. No network: every number on the page is in data.js.
// Default view: the rank-1 protocol's detail is open; #detail=0 in the URL
// opens the plain board instead. Detail order: the working, comparables,
// farm arithmetic, farm steps, raw record. No sandbox on the first screen.
// Model: implied = 10^(a + b*log10(TVL) + family + log10(momentum)) x
// double-count x plausibility x launch odds, Huber on the snapshot's own 92
// fee-token comps (a = 2.8719, b = 0.5195). The page replays every row from
// the stored rounded constants and checks itself against the board (see
// selfCheck): the badge under the ledger bar is that replay's result.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var state = { q: '', category: 'all', chain: 'all', tvl: 'all', sort: 'implied', dir: -1, tab: 'pre-token', wl: false, selected: null, suppressAuto: false, wi: { deposit: 1000, drop: 0.10, tbill: 0.04 } };
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.round(d) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 10000) / 10000).toString(); }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function round4(n) { return Math.round(n * 10000) / 10000; }

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  // The farm money line at any what-if setting: slice, expected slice,
  // forgone yield, net, break-even odds, verdict. Fees, hold and work hours
  // are stored per row and do not depend on the setting.
  function farmAt(r, wi) {
    var m = r.model, f = r.farm;
    var slice = round2((wi.drop * m.value_if_launches_usd * wi.deposit) / r.tvl_usd);
    var expected = round2(slice * m.launch_odds);
    var forgone = round2((wi.deposit * wi.tbill * f.hold_days) / 365);
    var net = round2(expected - f.fees_usd - forgone);
    var be = slice > 0 ? round4((f.fees_usd + forgone) / slice) : 99;
    var verdict = be <= DATA.model.verdict_farm_max ? 'FARM' : be <= DATA.model.verdict_thin_max ? 'THIN' : 'SKIP';
    return { slice_usd: slice, expected_slice_usd: expected, forgone_usd: forgone, net_usd: net, net_per_hour_usd: round2(net / f.work_hours), break_even_odds: be, verdict: verdict };
  }

  // The whole row, replayed from the stored rounded constants: the same
  // arithmetic the builder ran, so a mismatch would mean stale data.
  function replayRow(r) {
    var m = r.model;
    var logV = DATA.fit.intercept + DATA.fit.slope * Math.log10(r.tvl_usd) + m.family_offset + Math.log10(m.momentum_multiplier);
    var V = Math.max(1, Math.round(Math.pow(10, logV) * m.double_count_multiplier * m.plausibility));
    var implied = Math.max(1, Math.round(V * m.launch_odds));
    var half = Math.sqrt(Math.pow(DATA.validation.loo_resid_sd, 2) + Math.pow(m.refit_sd, 2));
    var band = {
      p10: Math.max(1, Math.round(implied * Math.pow(10, -DATA.model.band_z_p90 * half))),
      p25: Math.max(1, Math.round(implied * Math.pow(10, -DATA.model.band_z_p25 * half))),
      p75: Math.max(1, Math.round(implied * Math.pow(10, DATA.model.band_z_p25 * half))),
      p90: Math.max(1, Math.round(implied * Math.pow(10, DATA.model.band_z_p90 * half)))
    };
    var farm = farmAt(r, { deposit: DATA.model.default_deposit_usd, drop: DATA.model.default_drop_share, tbill: DATA.model.default_tbill });
    return { valueIfLaunches: V, implied: implied, band: band, farm: farm };
  }

  // Every row, recomputed in the browser and compared with the board:
  // implied value, the P10-P90 band, the slice, the net and the verdict.
  function selfCheck() {
    var bad = [];
    DATA.rows.forEach(function (r) {
      var rep = replayRow(r);
      var m = r.model, f = r.farm;
      if (rep.valueIfLaunches !== m.value_if_launches_usd) bad.push(r.slug + ': value');
      else if (rep.implied !== r.implied_value_usd) bad.push(r.slug + ': implied');
      else if (rep.band.p10 !== m.band_p10_usd || rep.band.p25 !== m.band_p25_usd || rep.band.p75 !== m.band_p75_usd || rep.band.p90 !== m.band_p90_usd) bad.push(r.slug + ': band');
      else if (rep.farm.slice_usd !== f.slice_usd || rep.farm.net_usd !== f.net_usd || rep.farm.break_even_odds !== f.break_even_odds || rep.farm.verdict !== f.verdict) bad.push(r.slug + ': farm');
    });
    return { ok: bad.length === 0, total: DATA.rows.length, bad: bad };
  }

  function opt(value, label, sel) { return h('option', { value: value, text: label, selected: sel ? 'selected' : null }); }
  function sel(id, label, options, current, onChange) {
    var s = h('select', { id: id, 'aria-label': label }, options.map(function (o) { return opt(o[0], o[1], o[0] === current); }));
    s.addEventListener('change', function () { onChange(s.value); writeHash(); render(); });
    return s;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('tvl')) state.tvl = p.get('tvl');
    if (p.get('sort')) state.sort = p.get('sort');
    if (p.get('p')) state.selected = p.get('p');
    if (p.get('tab') === 'live') state.tab = 'live';
    if (p.get('wl') === '1') state.wl = true;
    if (p.get('detail') === '0') { state.suppressAuto = true; state.selected = null; }
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.tvl !== 'all') p.set('tvl', state.tvl);
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.tab === 'live') p.set('tab', 'live');
    if (state.wl) p.set('wl', '1');
    if (state.selected) p.set('p', state.selected);
    if (state.suppressAuto && !state.selected) p.set('detail', '0');
    var next = p.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.tvl !== 'all') {
        var t = r.tvl_usd;
        if (state.tvl === 'g500' && t < 5e8) return false;
        if (state.tvl === '100-500' && (t < 1e8 || t >= 5e8)) return false;
        if (state.tvl === '50-100' && (t < 5e7 || t >= 1e8)) return false;
        if (state.tvl === 'lt50' && t >= 5e7) return false;
      }
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (state.sort === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (state.sort === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (state.sort === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (state.sort === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function countBy(list, key) {
    var c = {};
    list.forEach(function (r) { var k = key(r); c[k] = (c[k] || 0) + 1; });
    return c;
  }
  function filtersActive() {
    return state.q !== '' || state.category !== 'all' || state.chain !== 'all' || state.tvl !== 'all' || state.wl;
  }
  function clearFilters() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.tvl = 'all'; state.wl = false;
    writeHash(); render();
  }

  function masthead() {
    return h('header', { class: 'mast' }, h('div', { class: 'mast-in' },
      h('div', { class: 'wordmark' }, h('span', { class: 'pip', 'aria-hidden': 'true' }), 'Token Radar'),
      h('div', { class: 'mast-meta' },
        h('span', null, 'Snapshot ', h('b', { text: DATA.as_of })),
        h('span', null, 'Model ', h('b', { text: DATA.model_version })),
        h('span', null, 'DefiLlama protocol index')
      )
    ));
  }

  function hero() {
    var top = DATA.rows[0];
    return h('section', { class: 'hero' },
      h('div', null,
        h('div', { class: 'kicker', text: 'Pre-token radar · ' + DATA.model_version + ' · fitted curve, not a multiple' }),
        h('h1', { text: 'Forty watchlist protocols, ranked by implied value' }),
        h('p', { class: 'topline', text: 'Top of the board: ' + (top ? top.name + ' at ' + fmtUsd(top.implied_value_usd) : 'n/a') + ' · watchlist is the floor; the early radar adds ' + DATA.early_size + ' more.' })
      )
    );
  }

  function kpiStrip() {
    var v = DATA.validation;
    return h('div', { class: 'kpi' },
      h('span', null, h('b', { text: String(DATA.board_size) }), ' protocols ranked'),
      h('span', null, h('b', { text: fmtUsd(DATA.watchlist_implied_sum_usd) }), ' watchlist value'),
      h('span', null, h('b', { text: '40/40' }), ' watchlist covered'),
      h('span', null, h('b', { text: v.loo_miss_x.toFixed(2) + 'x' }), ' LOO miss, flat ' + v.baseline_loo_miss_x.toFixed(2) + 'x'),
      h('span', null, h('b', { text: Math.round(v.range_hold_p25_75 * 100) + '% / ' + Math.round(v.range_hold_p10_90 * 100) + '%' }), ' range holds, aim 50/80'),
      h('span', null, h('b', { text: v.rank_stable + ' of 20' }), ' top-20 stable, 200 refits')
    );
  }

  function ledgerBar() {
    var l = DATA.ledger;
    var total = l.total;
    function pct(n) { return (n / total * 100).toFixed(1) + '%'; }
    var bar = h('div', { class: 'stackbar', 'aria-hidden': 'true' },
      h('i', { class: 'seg-ranked', style: 'width:' + pct(l.ranked) }),
      h('i', { class: 'seg-traded', style: 'width:' + pct(l.traded) }),
      h('i', { class: 'seg-aside', style: 'width:' + pct(l.set_aside) })
    );
    var parts = l.parts.map(function (p) { return p.rule + ' ' + p.n; }).join(' · ');
    var check = selfCheck();
    var badge = check.ok
      ? h('span', { class: 'selfcheck ok', text: '✓ page = board.json: ' + check.total + '/' + check.total + ' rows recomputed in your browser (defaults $1,000 · 10% drop · 4% T-bill)' })
      : h('span', { class: 'selfcheck bad', text: '✗ ' + check.bad.length + ' rows do not recompute: ' + check.bad.slice(0, 5).join(', ') });
    return h('div', { class: 'ledger' },
      h('div', { class: 'ledger-line' },
        h('b', { text: '758 = ' + l.ranked + ' ranked + ' + l.traded + ' traded + ' + l.set_aside + ' set aside' }),
        h('span', { class: 'ledger-parts', text: 'Set aside: ' + parts + '. Traded protocols already have a token.' })
      ),
      bar,
      h('div', { class: 'ledger-line' },
        h('span', { class: 'ledger-legend' },
          h('i', { class: 'dot dot-ranked' }), ' ranked ' + l.ranked + '  ',
          h('i', { class: 'dot dot-traded' }), ' traded ' + l.traded + '  ',
          h('i', { class: 'dot dot-aside' }), ' set aside ' + l.set_aside
        ),
        badge
      )
    );
  }

  function bestFarmsLine() {
    var bf = DATA.best_farms || [];
    if (bf.length === 0) return null;
    var items = bf.map(function (b) {
      return b.name + ' ' + fmtMoney(b.net_usd);
    }).join(' · ');
    return h('div', { class: 'bestfarms' },
      h('b', { text: 'Best farms at $1,000 · 10% drop · 4% T-bill: ' }),
      h('span', { text: items + ' — net after gas and forgone yield; points counted as $0.' })
    );
  }

  function evidenceBand() {
    var sc = DATA.scatter;
    var band = h('section', { class: 'card evidence' },
      h('div', { class: 'evidence-grid' },
        h('div', null, h('h2', { text: 'The fitted curve' }),
          h('div', { class: 'scatter' }, h('div', { class: 'scatter-svg' }, ''), h('div', { class: 'scatter-cap' },
            h('span', null, h('i', { class: 'dot dot-comp' }), ' ' + sc.n_comps + ' comps'),
            h('span', null, h('i', { class: 'dot dot-watch' }), ' watchlist'),
            h('span', null, h('i', { class: 'dot dot-early' }), ' early / off-list'),
            h('span', { text: 'Huber fit, R² ' + sc.r2.toFixed(2) + ' · band P25–P75 ±' + sc.band_half_width_log10.toFixed(2) })
          ))
        ),
        validationZone()
      )
    );
    var holder = band.querySelector('.scatter-svg');
    if (holder) holder.innerHTML = scatterSvgMarkup();
    return band;
  }

  function validationZone() {
    var v = DATA.validation;
    function metricRow(label, model, base) {
      return h('div', { class: 'vz-row' },
        h('span', { text: label }),
        h('b', { text: model }),
        h('span', { class: 'vz-base', text: base })
      );
    }
    return h('div', { class: 'vzone' },
      h('h3', { text: 'Out-of-sample validation' }),
      metricRow('Leave-one-out, median miss', v.loo_miss_x.toFixed(2) + 'x', 'flat ' + v.baseline_loo_miss_x.toFixed(2) + 'x · within 3x ' + Math.round(v.loo_within3 * 100) + '% vs ' + Math.round(v.baseline_loo_within3 * 100) + '%'),
      metricRow('Walk-forward, before 2025-01-01 (n=' + v.walkforward_2025_01_01_n_test + ')', v.walkforward_2025_01_01_miss_x.toFixed(2) + 'x', 'flat ' + v.baseline_walkforward_2025_01_01_miss_x.toFixed(2) + 'x'),
      metricRow('Walk-forward, before 2025-06-30 (n=' + v.walkforward_2025_06_30_n_test + ')', v.walkforward_2025_06_30_miss_x.toFixed(2) + 'x', 'flat ' + v.baseline_walkforward_2025_06_30_miss_x.toFixed(2) + 'x'),
      metricRow('Range holds', Math.round(v.range_hold_p25_75 * 100) + '% / ' + Math.round(v.range_hold_p10_90 * 100) + '%', 'P25–P75 / P10–P90 · aim 50/80'),
      metricRow('Rank stability', v.rank_stable + ' of ' + v.rank_stable_total, 'top 20 stay top 20 · 200 refits'),
      h('p', { class: 'note', text: v.conclusion.split('. ')[0] + '.' })
    );
  }

  function scatterSvgMarkup() {
    // Rebuild the SVG string (same code as scatterSvg, kept as a string so
    // the DOM helper does not need an innerHTML path elsewhere).
    var sc = DATA.scatter;
    var W = 560, H = 140, ml = 46, mr = 8, mt = 8, mb = 26;
    var pts = [];
    sc.comps.forEach(function (c) { pts.push({ x: Math.log10(c.tvl_usd), y: Math.log10(c.value_usd), kind: 'comp' }); });
    sc.board.forEach(function (b) { pts.push({ x: Math.log10(b.tvl_usd), y: Math.log10(b.value_usd), kind: WATCH[b.slug] ? 'watch' : 'early' }); });
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var x0 = Math.floor(Math.min.apply(null, xs) - 0.2), x1 = Math.ceil(Math.max.apply(null, xs) + 0.2);
    var y0 = Math.floor(Math.min.apply(null, ys) - 0.2), y1 = Math.ceil(Math.max.apply(null, ys) + 0.2);
    function X(v) { return ml + (v - x0) / (x1 - x0) * (W - ml - mr); }
    function Y(v) { return mt + (y1 - v) / (y1 - y0) * (H - mt - mb); }
    function moneyLabel(logv) {
      var v = Math.pow(10, logv);
      if (v >= 1e9) return '$' + (v / 1e9) + 'B';
      if (v >= 1e6) return '$' + (v / 1e6) + 'M';
      return '$' + Math.round(v / 1e3) + 'K';
    }
    var svg = [];
    svg.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Fitted curve scatter">');
    var t, lo = Math.min(x0, y0), hi = Math.max(x1, y1);
    for (t = lo; t <= hi; t++) {
      if (t >= x0 && t <= x1) {
        var ax = X(t), anch = 'middle';
        if (t === x1) { ax = Math.min(ax, W - 2); anch = 'end'; }
        if (t === x0) { ax = Math.max(ax, 2); anch = 'start'; }
        svg.push('<line x1="' + X(t).toFixed(1) + '" y1="' + Y(y0).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y2="' + Y(y1).toFixed(1) + '" stroke="#e9e2d0"/>');
        svg.push('<text x="' + ax.toFixed(1) + '" y="' + (H - 8) + '" font-size="10" fill="#68778a" text-anchor="' + anch + '">' + moneyLabel(t) + '</text>');
      }
      if (t >= y0 && t <= y1) {
        svg.push('<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(t).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" stroke="#e9e2d0"/>');
        svg.push('<text x="' + (ml - 6) + '" y="' + (Y(t) + 3).toFixed(1) + '" font-size="10" fill="#68778a" text-anchor="end">' + moneyLabel(t) + '</text>');
      }
    }
    var half = sc.band_half_width_log10;
    var top = [x0, x1].map(function (x) { return X(x).toFixed(1) + ',' + Y(DATA.fit.intercept + DATA.fit.slope * x + half).toFixed(1); }).join(' ');
    var bot = [x1, x0].map(function (x) { return X(x).toFixed(1) + ',' + Y(DATA.fit.intercept + DATA.fit.slope * x - half).toFixed(1); }).join(' ');
    svg.push('<polygon points="' + top + ' ' + bot + '" fill="#b45309" fill-opacity="0.10"/>');
    svg.push('<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(DATA.fit.intercept + DATA.fit.slope * x0).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(DATA.fit.intercept + DATA.fit.slope * x1).toFixed(1) + '" stroke="#b45309" stroke-width="2"/>');
    pts.forEach(function (p) {
      var fill = p.kind === 'comp' ? '#9aa5b1' : p.kind === 'watch' ? '#0f766e' : '#d97706';
      var r = p.kind === 'comp' ? 2.2 : 3;
      svg.push('<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + r + '" fill="' + fill + '"/>');
    });
    svg.push('<text x="' + X(x1).toFixed(1) + '" y="' + (Y(DATA.fit.intercept + DATA.fit.slope * x1) - 8).toFixed(1) + '" font-size="11" fill="#92400e" text-anchor="end" font-weight="700">log10(mcap) = ' + DATA.fit.intercept.toFixed(4) + ' + ' + DATA.fit.slope.toFixed(4) + ' x log10(TVL)</text>');
    svg.push('</svg>');
    return svg.join('');
  }

  function whatIf() {
    function wiSel(id, label, options, current, onChange) {
      return h('div', { class: 'field' }, h('label', { for: id, text: label }),
        sel(id, label, options, current, function (v) { onChange(parseFloat(v)); }));
    }
    return h('div', { class: 'whatif' },
      h('div', { class: 'whatif-head' },
        h('b', { text: 'What-if: reprice the farm' }),
        h('span', { text: 'Slice, net and verdict recompute live. FARM if break-even ≤ ' + Math.round(DATA.model.verdict_farm_max * 100) + '% (pays at ~a quarter of modeled odds), THIN ≤ ' + Math.round(DATA.model.verdict_thin_max * 100) + '%, else SKIP.' })
      ),
      h('div', { class: 'whatif-controls' },
        wiSel('wi-deposit', 'Deposit', [[1000, '$1,000'], [5000, '$5,000'], [10000, '$10,000']], state.wi.deposit, function (v) { state.wi.deposit = v; }),
        wiSel('wi-drop', 'Drop share', [[0.05, '5% of the launch'], [0.10, '10% of the launch'], [0.20, '20% of the launch']], state.wi.drop, function (v) { state.wi.drop = v; }),
        wiSel('wi-tbill', 'T-bill (forgone yield)', [[0, '0%'], [0.04, '4%'], [0.08, '8%']], state.wi.tbill, function (v) { state.wi.tbill = v; })
      )
    );
  }

  function toolbar() {
    var catCounts = countBy(DATA.rows, function (r) { return r.category || 'Other'; });
    var cats = Object.keys(catCounts).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; });
    var tvlCounts = { g500: 0, '100-500': 0, '50-100': 0, lt50: 0 };
    DATA.rows.forEach(function (r) {
      if (r.tvl_usd >= 5e8) tvlCounts.g500++;
      else if (r.tvl_usd >= 1e8) tvlCounts['100-500']++;
      else if (r.tvl_usd >= 5e7) tvlCounts['50-100']++;
      else tvlCounts.lt50++;
    });
    var search = h('input', { type: 'search', id: 'q', placeholder: 'Search name or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = sel('category', 'Filter by category',
      [['all', 'All categories (' + DATA.rows.length + ')']].concat(cats.map(function (c) { return [c, c + ' (' + catCounts[c] + ')']; })),
      state.category, function (v) { state.category = v; });
    var chainSel = sel('chain', 'Filter by chain',
      [['all', 'All chains (' + DATA.rows.length + ')']].concat(chains.map(function (c) { return [c, c + ' (' + chainCounts[c] + ')']; })),
      state.chain, function (v) { state.chain = v; });
    var tvlSel = sel('tvl', 'Filter by TVL',
      [['all', 'Any TVL (' + DATA.rows.length + ')'], ['g500', 'TVL $500M+ (' + tvlCounts.g500 + ')'], ['100-500', 'TVL $100M–$500M (' + tvlCounts['100-500'] + ')'], ['50-100', 'TVL $50M–$100M (' + tvlCounts['50-100'] + ')'], ['lt50', 'TVL under $50M (' + tvlCounts.lt50 + ')']],
      state.tvl, function (v) { state.tvl = v; });
    var sortSel = sel('sort', 'Sort the board',
      [['implied', 'Sort: Implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7-day growth'], ['age', 'Sort: Age'], ['name', 'Sort: Name']],
      state.sort, function (v) { state.sort = v; state.dir = -1; });
    var wl = h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: state.wl ? 'checked' : null, onchange: function (e) { state.wl = e.target.checked; writeHash(); render(); } }),
      'Watchlist only'
    );
    var pre = h('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = h('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var list = state.tab === 'pre-token' ? filtered() : DATA.live;
    var bar = h('div', { class: 'toolbar', id: 'board-wrap' },
      h('div', { class: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'field' }, h('label', { for: 'category', text: 'Category' }), catSel),
      h('div', { class: 'field' }, h('label', { for: 'chain', text: 'Chain' }), chainSel),
      h('div', { class: 'field' }, h('label', { for: 'tvl', text: 'TVL' }), tvlSel),
      h('div', { class: 'field' }, h('label', { for: 'sort', text: 'Sort' }), sortSel),
      h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Token status' }), h('div', { class: 'seg' }, pre, live)),
      wl,
      h('span', { class: 'shown', text: state.tab === 'pre-token' ? list.length + ' of ' + DATA.rows.length + ' rows' : DATA.live.length + ' live-token protocols' })
    );
    if (state.tab === 'pre-token' && filtersActive()) {
      var chips = h('div', { class: 'chips' });
      if (state.q) chips.appendChild(h('span', { class: 'fchip', text: 'Search: ' + state.q }));
      if (state.category !== 'all') chips.appendChild(h('span', { class: 'fchip', text: 'Category: ' + state.category }));
      if (state.chain !== 'all') chips.appendChild(h('span', { class: 'fchip', text: 'Chain: ' + state.chain }));
      if (state.tvl !== 'all') chips.appendChild(h('span', { class: 'fchip', text: 'TVL: ' + tvlSel.options[tvlSel.selectedIndex].text }));
      if (state.wl) chips.appendChild(h('span', { class: 'fchip', text: 'Watchlist only' }));
      chips.appendChild(h('button', { class: 'btn small', type: 'button', text: 'Clear all filters', onclick: clearFilters }));
      bar.appendChild(chips);
    }
    return bar;
  }

  function sortBtn(key, label) {
    return h('th', { scope: 'col' }, h('button', {
      type: 'button',
      onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = -1; }
        writeHash(); render();
      }
    }, label, state.sort === key ? h('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null));
  }

  function statusTag(r) {
    if (WATCH[r.slug]) return h('span', { class: 'tag tag-teal', text: 'Watchlist' });
    if (r.row_kind === 'off-list') return h('span', { class: 'tag tag-amber', text: 'Off-list' });
    return h('span', { class: 'tag tag-grey', text: 'Early' });
  }

  function verdictChip(v) {
    if (v === 'FARM') return h('span', { class: 'tag tag-teal', text: 'FARM' });
    if (v === 'THIN') return h('span', { class: 'tag tag-amber', text: 'THIN' });
    return h('span', { class: 'tag tag-red', text: 'SKIP' });
  }

  function boardTable() {
    var list = sorted(filtered());
    if (list.length === 0) {
      return h('div', { class: 'card' }, h('div', { class: 'empty' },
        h('h2', { text: 'No matches' }),
        h('p', { text: 'Clear the filters to see the board again.' }),
        h('button', { class: 'btn dark', type: 'button', text: 'Clear filters', onclick: clearFilters })
      ));
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var body = h('tbody');
    list.forEach(function (r) {
      var g = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
      var fa = farmAt(r, state.wi);
      body.appendChild(h('tr', {
        class: state.selected === r.slug ? 'sel' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        h('td', { class: 'num rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) }),
        h('td', null, h('div', { class: 'cell-name' },
          h('div', { class: 'name-row' }, h('b', { text: r.name }), statusTag(r)),
          h('span', { class: 'cell-sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'one chain') })
        )),
        h('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        h('td', { class: 'num ' + gc, text: g }),
        h('td', { class: 'num', text: fmtAge(r.age_days) }),
        h('td', null, h('div', { class: 'implied-cell' },
          h('span', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          h('div', { class: 'implied-stack' },
            h('b', { class: 'num implied-val', text: fmtUsd(r.implied_value_usd) }),
            h('span', { class: 'band', text: fmtUsd(r.model.band_p10_usd) + '–' + fmtUsd(r.model.band_p90_usd) })
          )
        )),
        h('td', { class: 'num', text: fmtMoney(fa.slice_usd) }),
        h('td', { class: 'num', text: Math.round(fa.break_even_odds * 100) + '%' }),
        h('td', null, verdictChip(fa.verdict)),
        h('td', { class: 'num farmecon', text: fmtMoney(r.farm.fees_usd) + ' fees · ' + r.farm.hold_days + 'd · ' + r.farm.work_hours + 'h' })
      ));
    });
    return h('div', { class: 'card' }, h('div', { class: 'scroll' },
      h('table', null,
        h('caption', { text: 'Pre-token protocols, strongest implied value first, with the P10–P90 band underneath. Slice, break-even and verdict follow the what-if setting.' }),
        h('thead', null, h('tr', null,
          sortBtn('implied', 'Rank'), sortBtn('name', 'Protocol'), sortBtn('tvl', 'TVL'),
          sortBtn('growth', '7d'), sortBtn('age', 'Age'), sortBtn('implied', 'Implied value'),
          h('th', { scope: 'col', text: 'Slice $' + state.wi.deposit.toLocaleString('en-US') }),
          h('th', { scope: 'col', text: 'Break-even' }), h('th', { scope: 'col', text: 'Verdict' }),
          h('th', { scope: 'col', text: 'Farm' })
        )),
        body
      )
    ));
  }

  function liveTable() {
    var body = h('tbody');
    DATA.live.forEach(function (r) {
      body.appendChild(h('tr', null,
        h('td', null, h('span', { class: 'tag tag-teal', text: 'live' })),
        h('td', null, h('div', { class: 'cell-name' },
          h('b', { text: r.name }),
          h('span', { class: 'cell-sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'one chain') })
        )),
        h('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        h('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        h('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        h('td', { class: 'num', text: r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(3) + 'x' : 'n/a' })
      ));
    });
    return h('div', { class: 'card' }, h('div', { class: 'scroll' },
      h('table', null,
        h('caption', { text: 'Already trading: market cap is a fact here, not a model. Set aside from the ranking; their mcap/TVL ratios are the comparables behind the model.' }),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col', text: 'Status' }), h('th', { scope: 'col', text: 'Protocol' }),
          h('th', { scope: 'col', text: 'TVL' }), h('th', { scope: 'col', text: '7d' }),
          h('th', { scope: 'col', text: 'Market cap' }), h('th', { scope: 'col', text: 'mcap / TVL' })
        )),
        body
      )
    ));
  }

  function modelSection() {
    var m = DATA.model, f = DATA.fit;
    var famRows = Object.keys(f.family_offsets).sort(function (a, b) { return f.family_offsets[b] - f.family_offsets[a]; }).map(function (fam) {
      var off = f.family_offsets[fam];
      return h('tr', null,
        h('td', null, h('b', { text: fam })),
        h('td', { class: 'num', text: (off >= 0 ? '+' : '') + off.toFixed(4) + ' in log10' }),
        h('td', { class: 'num', text: String(f.family_n[fam] || 0) })
      );
    });
    var rules = DATA.plausibility_rules.map(function (r) {
      return h('li', null, h('b', { text: 'x' + r.factor.toFixed(2) + ' — ' }), r.reason);
    });
    return h('div', null,
      h('section', { class: 'card section' },
        h('h2', { text: 'How implied value is computed' }),
        h('p', { text: 'One function of the snapshot figures. The curve is a Huber log-log fit of market cap on TVL over ' + f.pool_n + ' fee-token comps (' + f.pool_rule + '). Family offsets are shrunk medians (k=16); momentum is a stated projection; launch odds come from the cohort listed at least as long. No name is special-cased.' }),
        h('div', { class: 'formula', text: 'V = 10 ^ (' + f.intercept.toFixed(4) + ' + ' + f.slope.toFixed(4) + ' x log10(TVL) + family_offset + log10(momentum)) x double-count x plausibility;  implied = V x launch_odds' }),
        h('div', { class: 'grid2' },
          h('div', null,
            h('h3', { text: 'Family offsets (shrunk, k=16, in log10)' }),
            h('div', { class: 'scroll' }, h('table', { class: 'mini' },
              h('thead', null, h('tr', null, h('th', { text: 'Family' }), h('th', { text: 'Offset' }), h('th', { text: 'Comps' }))),
              h('tbody', null, famRows)
            )),
            h('p', { class: 'note', text: 'Unnamed families get no offset. The offsets nudge rows: the curve alone beats the flat baseline on every held-out test, and the ablation table below shows what each factor adds.' })
          ),
          h('div', null,
            h('h3', { text: 'Plausibility rules' }),
            h('ol', { class: 'rules' }, rules),
            h('p', { class: 'note', text: 'Token already trades: USDD, dTAO (TAO), Plume Vaults (PLUME), Mezo Earn (MEZO). No token thesis: Lightning Network. Chain rows score 0.20 by the weak-thesis rule; Risk Curators score 0.50 by the private-firm rule. Everything else scores 1.00.' }),
            h('h3', { text: 'Other factors' }),
            h('p', { class: 'note', text: 'Momentum: 1 + 0.25 x clamp(change_7d, -25%, +25%) / 100 — at most +/-6% on any row. Double-count: 0.50x Risk Curators and Onchain Capital Allocators, 0.75x Restaking, Collateral Markets and Staking Pools, 1.00x otherwise. Launch odds: the share of protocols listed at least as long ago that record a token today; unknown date uses ' + m.unknown_age_days + ' days. Bands: P25–P75 +/-0.6745 sd, P10–P90 +/-1.2816 sd, sd = sqrt(LOO sd^2 + row refit sd^2).' })
          )
        )
      ),
      validationSection()
    );
  }

  function validationSection() {
    var v = DATA.validation;
    var abBody = h('tbody');
    v.ablation.forEach(function (a) {
      abBody.appendChild(h('tr', null,
        h('td', null, h('b', { text: a.variant })),
        h('td', { class: 'num', text: a.loo_miss_x.toFixed(2) + 'x' }),
        h('td', { class: 'num', text: Math.round(a.loo_within3 * 100) + '%' }),
        h('td', { class: 'num', text: a.rank_corr.toFixed(2) }),
        h('td', { class: 'num', text: a.walkforward_2025_01_01_miss_x.toFixed(2) + 'x' }),
        h('td', { class: 'num', text: a.walkforward_2025_06_30_miss_x.toFixed(2) + 'x' }),
        h('td', { class: 'num', text: a.top20_kept + ' / 20' })
      ));
    });
    return h('section', { class: 'card section' },
      h('h2', { text: 'Out-of-sample validation, in full' }),
      h('p', { text: v.method }),
      h('div', { class: 'scroll' }, h('table', { class: 'mini' },
        h('thead', null, h('tr', null,
          h('th', { text: 'Variant' }), h('th', { text: 'LOO miss' }), h('th', { text: 'Within 3x' }),
          h('th', { text: 'Rank corr.' }), h('th', { text: 'WF 2025-01-01' }), h('th', { text: 'WF 2025-06-30' }),
          h('th', { text: 'Top 20 kept' })
        )),
        abBody
      )),
      h('p', { class: 'note', text: 'LOO = leave-one-out over the ' + v.loo_n + ' comps. Walk-forward fits before the cut, tests after. Rank corr. is the Spearman correlation of predicted vs actual log(mcap). Top 20 kept counts how many of the chosen top 20 stay top 20 under that variant.' }),
      h('p', { class: 'note', text: v.conclusion })
    );
  }

  var scrim = h('div', { class: 'scrim', hidden: '', onclick: closeDetail });
  var panel = h('aside', { class: 'panel', hidden: '', 'aria-label': 'Protocol detail' });
  function closeDetail() {
    state.selected = null;
    state.suppressAuto = true;
    panel.setAttribute('hidden', '');
    scrim.setAttribute('hidden', '');
    writeHash();
    render();
  }

  function parseStep(s) {
    var at = s.indexOf(' Cost: ');
    if (at < 0) return { action: s, cost: '', time: '' };
    var tail = s.slice(at + 7);
    var tt = tail.indexOf('. Time: ');
    if (tt < 0) return { action: s.slice(0, at), cost: tail.replace(/\.$/, ''), time: '' };
    return { action: s.slice(0, at), cost: tail.slice(0, tt), time: tail.slice(tt + 8).replace(/\.$/, '') };
  }

  function verdictReason(be, odds, verdict) {
    var bePct = Math.round(be * 100) + '%';
    var oddsPct = Math.round(odds * 100) + '%';
    if (be > 1) return 'Break-even odds ' + bePct + ' — above 100%: the slice never covers the costs, at any launch odds. The model says ' + oddsPct + '.';
    if (verdict === 'FARM') {
      var ratio = odds / be;
      return 'Break-even odds ' + bePct + '; the model says ' + oddsPct + ' — the farm pays even if the launch is ' + (ratio >= 10 ? 'more than ten times' : Math.max(1, Math.round(ratio)) + 'x') + ' less likely than modeled.';
    }
    if (verdict === 'THIN') return 'Break-even odds ' + bePct + '; the model says ' + oddsPct + ' — the farm pays only if the launch is nearly as likely as modeled.';
    return 'Break-even odds ' + bePct + '; the model says ' + oddsPct + ' — the farm needs a launch more likely than the model says.';
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    state.suppressAuto = false;
    writeHash();
    panel.textContent = '';
    var m = row.model;
    var rep = replayRow(row);
    var fa = farmAt(row, state.wi);
    var f = row.farm;
    var ratios = DATA.scatter.comps.map(function (c) { return c.value_usd / c.tvl_usd; }).sort(function (a, b) { return a - b; });
    var medRatio = ratios[Math.floor(ratios.length / 2)];
    var head = h('div', { class: 'panel-head' },
      h('div', null,
        h('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' · watchlist' : row.row_kind === 'off-list' ? ' · off-list' : ' · early radar') }),
        h('h2', { text: row.name }),
        h('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'one chain') + ' · records no token · ' + fmtAge(m.age_days) + ' with no token' })
      ),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: closeDetail })
    );
    panel.appendChild(head);
    panel.appendChild(h('div', { class: 'p-value' },
      h('span', { text: 'Implied value' }),
      h('b', { text: fmtUsd(row.implied_value_usd) }),
      h('span', { class: 'p-ranges', text: 'P10–P90 ' + fmtUsd(m.band_p10_usd) + ' – ' + fmtUsd(m.band_p90_usd) + ' · P25–P75 ' + fmtUsd(m.band_p25_usd) + ' – ' + fmtUsd(m.band_p75_usd) + ' (' + m.band_basis + ')' }),
      h('span', { class: 'p-basis', text: 'Value if it launches ' + fmtUsd(m.value_if_launches_usd) + ' x launch odds ' + Math.round(m.launch_odds * 100) + '% (' + m.launch_odds_basis + ')' })
    ));
    // 1) The working: every factor, then the equation with real numbers.
    var factors = h('div', { class: 'factors2' });
    [
      ['TVL', fmtUsd(row.tvl_usd)],
      ['log10(TVL)', Math.log10(row.tvl_usd).toFixed(4)],
      ['Curve value', fmtUsd(Math.pow(10, DATA.fit.intercept + DATA.fit.slope * Math.log10(row.tvl_usd)))],
      ['Family offset', (m.family === null ? 'none' : m.family + ' ' + (m.family_offset >= 0 ? '+' : '') + m.family_offset.toFixed(4))],
      ['Momentum', 'x' + fmtMult(m.momentum_multiplier)],
      ['Double-count', 'x' + fmtMult(m.double_count_multiplier)],
      ['Plausibility', 'x' + fmtMult(m.plausibility)],
      ['Launch odds', Math.round(m.launch_odds * 100) + '%']
    ].forEach(function (kv) {
      factors.appendChild(h('div', null, h('span', { text: kv[0] }), h('b', { text: kv[1] })));
    });
    panel.appendChild(h('section', { class: 'psec first' },
      h('h3', { text: 'Implied value — the working' }),
      factors,
      h('div', { class: 'working', text: '10 ^ (' + DATA.fit.intercept.toFixed(4) + ' + ' + DATA.fit.slope.toFixed(4) + ' x ' + Math.log10(row.tvl_usd).toFixed(4) + ' + ' + m.family_offset.toFixed(4) + ' + log10(' + fmtMult(m.momentum_multiplier) + ')) = ' + fmtUsd(Math.pow(10, DATA.fit.intercept + DATA.fit.slope * Math.log10(row.tvl_usd) + m.family_offset + Math.log10(m.momentum_multiplier))) + ' x ' + fmtMult(m.double_count_multiplier) + ' x ' + fmtMult(m.plausibility) + ' = ' + fmtUsd(m.value_if_launches_usd) + ' x ' + Math.round(m.launch_odds * 100) + '% = ' + fmtUsd(row.implied_value_usd) }),
      h('p', { class: 'note', text: m.family_offset_basis + '. ' + m.momentum_basis + '. The page recomputes this row as ' + fmtUsd(rep.implied) + (rep.implied === row.implied_value_usd ? ', the same number the board carries.' : ', which differs from the board — the data would be stale.') })
    ));
    // 2) Comparables, picked for this row alone.
    var compBody = h('tbody');
    (m.comparables || []).slice(0, 5).forEach(function (c) {
      compBody.appendChild(h('tr', null,
        h('td', null, h('b', { text: c.name })),
        h('td', { class: 'num', text: c.ratio.toFixed(3) + 'x' }),
        h('td', { class: 'num', text: fmtUsd(c.mcap_usd) }),
        h('td', { class: 'num', text: fmtUsd(c.tvl_usd) })
      ));
    });
    panel.appendChild(h('section', { class: 'psec' },
      h('h3', { text: 'Comparables — nearest by TVL, from the ' + m.comparables_n + '-comp fit pool' }),
      h('p', { class: 'note', text: 'Live-token comps, mcap/TVL in (0, 3], CEX and bridge tokens excluded. Pool median ' + medRatio.toFixed(3) + 'x; the curve prices size, not the median.' }),
      h('div', { class: 'scroll' }, h('table', { class: 'mini' },
        h('thead', null, h('tr', null, h('th', { text: 'Protocol' }), h('th', { text: 'mcap / TVL' }), h('th', { text: 'Market cap' }), h('th', { text: 'TVL' }))),
        compBody
      ))
    ));
    // 3) The farm arithmetic: slice and break-even, with the numbers in.
    var econ = h('div', { class: 'econ' }, [
      ['Deposit', fmtUsd(state.wi.deposit), ''],
      ['Drop share', Math.round(state.wi.drop * 100) + '%', ''],
      ['Slice = drop x V x deposit / TVL', fmtMoney(fa.slice_usd), ''],
      ['Expected slice = slice x odds', fmtMoney(fa.expected_slice_usd), ''],
      ['Fees (gas + weekly)', fmtMoney(f.fees_usd), ''],
      ['Forgone = dep. x T-bill x hold/365', fmtMoney(fa.forgone_usd), ''],
      ['Net = exp−fees−forgone', fmtMoney(fa.net_usd) + ' (' + fmtMoney(fa.net_per_hour_usd) + '/h)', 'hl'],
      ['Break-even = (fees+forgone)/slice', Math.round(fa.break_even_odds * 100) + '%', 'hl']
    ].map(function (kv) {
      return h('div', { class: kv[2] || null }, h('span', { text: kv[0] }), h('b', { text: kv[1] }));
    }));
    panel.appendChild(h('section', { class: 'psec' },
      h('h3', { text: 'The farm arithmetic' }),
      econ,
      h('p', { class: 'note', text: 'Verdict ' + fa.verdict + ': ' + verdictReason(fa.break_even_odds, m.launch_odds, fa.verdict) }),
      h('p', { class: 'note', text: 'Hold ' + f.hold_days + ' days, about ' + f.work_hours + ' hours of work (setup plus a weekly check). Points value is counted as $0 — never promised, never counted. ' + f.risk })
    ));
    // 4) Farm plan, with its signal and its steps.
    var steps = h('ol', { class: 'steps' });
    row.farm_steps.forEach(function (s) {
      var p = parseStep(s);
      var chips = h('span', { class: 'schips' });
      if (p.cost) chips.appendChild(h('span', { class: 'schip', text: 'Cost: ' + p.cost }));
      if (p.time) chips.appendChild(h('span', { class: 'schip', text: 'Time: ' + p.time }));
      steps.appendChild(h('li', null, h('b', { text: p.action }), chips));
    });
    panel.appendChild(h('section', { class: 'psec' },
      h('h3', { text: 'Farm plan' }),
      h('p', { class: 'note', text: 'Signal: ' + (f.signal || '') }),
      steps
    ));
    // 5) Its record: the snapshot's own fields, nulls as null.
    var recBody = h('tbody');
    [['tvl_usd', row.tvl_usd], ['change_7d', row.change_7d], ['listed_at', row.listed_at], ['category', row.category], ['chains', (row.chains || []).join(', ') || null], ['mcap_usd', row.mcap_usd], ['gecko_id', row.gecko_id], ['symbol', row.symbol]].forEach(function (kv) {
      recBody.appendChild(h('tr', null, h('td', null, h('b', { text: kv[0] })), h('td', { class: 'num', text: kv[1] === null || kv[1] === undefined ? 'null' : String(kv[1]) })));
    });
    panel.appendChild(h('section', { class: 'psec' },
      h('h3', { text: 'Its record' }),
      h('p', { class: 'note', text: 'The snapshot\u2019s own fields — null means the snapshot carries no value.' }),
      h('div', { class: 'scroll' }, h('table', { class: 'mini' }, recBody))
    ));
    if (m.plausibility < 1) {
      panel.appendChild(h('div', { class: 'banner' }, h('b', { text: 'Plausibility x' + m.plausibility.toFixed(2) + '. ' }), m.plausibility_reason + '.'));
    }
    panel.removeAttribute('hidden');
    scrim.removeAttribute('hidden');
    panel.scrollTop = 0;
  }

  function render() {
    app.textContent = '';
    var shell = h('div', null);
    shell.appendChild(masthead());
    var wrap = h('div', { class: 'wrap' });
    wrap.appendChild(hero());
    wrap.appendChild(kpiStrip());
    wrap.appendChild(ledgerBar());
    wrap.appendChild(bestFarmsLine());
    wrap.appendChild(evidenceBand());
    wrap.appendChild(whatIf());
    wrap.appendChild(toolbar());
    wrap.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') wrap.appendChild(modelSection());
    wrap.appendChild(h('footer', { class: 'foot' },
      h('p', { text: 'Snapshot: DefiLlama protocol index, as of ' + DATA.as_of + ', floor $' + Math.round(DATA.floor_usd / 1e6) + 'M, ' + DATA.watchlist_size + ' watchlist protocols. TVL moves with prices; the same capital is counted in several protocols; adapters are often written by the protocol itself. Listed date is when DefiLlama started tracking, a maturity proxy, not a launch date.' }),
      h('p', { text: 'A token-less listing is not a promise of a token. Where no live program exists the plan says so. Never pay to claim, and claim only from the protocol\u2019s own published link.' })
    ));
    shell.appendChild(wrap);
    app.appendChild(shell);
    app.appendChild(scrim);
    app.appendChild(panel);
    app.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  if (!state.selected && !state.suppressAuto && DATA.rows.length > 0) state.selected = DATA.rows[0].slug;
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hasAttribute('hidden')) closeDetail(); });
})();
