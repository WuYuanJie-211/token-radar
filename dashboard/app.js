// Token Radar dashboard (radar-4). Reads window.RADAR, written beside
// dashboard/ by main.ts. No network: every number on the page is in data.js.
// The page never fetches, never imports, and never links out.
//
// Default view: the rank-1 protocol's detail is open. Close the panel and
// it stays closed until a row is picked; #detail=0 in the URL opens the
// plain board instead. Detail order: the working, then the comparables,
// then the farm plan. There is no sandbox: the working itself is the replay.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var state = { q: '', category: 'all', chain: 'all', tvl: 'all', sort: 'implied', dir: -1, tab: 'pre-token', wl: false, selected: null, suppressAuto: false };
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

  // The model, replayed in the page so the detail view can show its own
  // working and check it against the board value with the same arithmetic.
  function scoreRow(tvl, mult, sizeAdj, growthPct, ageDays, chains, dbl, plaus) {
    var g = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, growthPct));
    var growthMult = 1 + (g / 100) * DATA.model.growth_weight;
    var age = ageDays === null || ageDays === undefined || !isFinite(ageDays) ? DATA.model.unknown_age_days : ageDays;
    var maturity = DATA.model.maturity_floor + (Math.min(Math.max(age, 0), DATA.model.maturity_days) / DATA.model.maturity_days) * DATA.model.maturity_range;
    var chain = chains >= 10 ? DATA.model.chain_wide : chains >= 4 ? DATA.model.chain_many : chains >= 2 ? DATA.model.chain_few : DATA.model.chain_one;
    return { implied: Math.max(1, Math.round(tvl * mult * sizeAdj * growthMult * maturity * chain * dbl * plaus)), growthMult: growthMult, maturity: maturity, chain: chain };
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

  function blindLine() {
    var v = DATA.validation;
    if (!v) return '';
    return 'Blind test: 5-fold CV log-RMSE ' + v.held_out_rmse.toFixed(3) + ' (R\u00b2 ' + v.held_out_r2.toFixed(2) + ') vs flat baseline ' + v.baseline_rmse.toFixed(3) + '; walk-forward beats the baseline on both splits (' + v.walkforward_2025_01_01_model_rmse.toFixed(3) + ' vs ' + v.walkforward_2025_01_01_baseline_rmse.toFixed(3) + '; ' + v.walkforward_2025_06_30_model_rmse.toFixed(3) + ' vs ' + v.walkforward_2025_06_30_baseline_rmse.toFixed(3) + ').';
  }

  function hero() {
    var top = DATA.rows[0];
    var med = null;
    DATA.categories.forEach(function (c) { if (c.category === 'RWA') med = c.median; });
    return h('section', { class: 'hero' },
      h('div', null,
        h('div', { class: 'kicker', text: 'Pre-token radar · ' + DATA.model_version }),
        h('h1', { text: 'Forty watchlist protocols, ranked by implied value' }),
        h('p', { class: 'topline', text: 'Top of the board: ' + (top ? top.name + ' at ' + fmtUsd(top.implied_value_usd) : 'n/a') + ' · watchlist is the floor, early radar adds ' + DATA.early_size + ' more. Select any row for its valuation, comparables and farm plan.' })
      ),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { text: 'Watchlist covered' }), h('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        h('div', { class: 'stat' }, h('span', { text: 'Watchlist implied value' }), h('b', { text: fmtUsd(DATA.watchlist_implied_sum_usd) })),
        h('div', { class: 'stat' }, h('span', { text: 'Pre-token rows scored' }), h('b', { text: String(DATA.board_size) })),
        h('div', { class: 'stat' }, h('span', { text: 'Median multiple (all comps)' }), h('b', { text: '0.177x' })),
        h('div', { class: 'stat' }, h('span', { text: 'RWA median multiple' }), h('b', { text: med === null ? 'n/a' : med.toFixed(3) + 'x' }))
      )
    );
  }

  function kpiStrip() {
    return h('div', { class: 'kpi' },
      h('span', null, h('b', { text: '200' }), ' protocols ranked'),
      h('span', null, h('b', { text: fmtUsd(DATA.watchlist_implied_sum_usd) }), ' watchlist implied value'),
      h('span', null, h('b', { text: '40/40' }), ' watchlist covered'),
      h('span', { class: 'kpi-blind', text: blindLine() })
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
    function opt(value, label, sel) { return h('option', { value: value, text: label, selected: sel ? 'selected' : null }); }
    var search = h('input', { type: 'search', id: 'q', placeholder: 'Search name or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = h('select', { id: 'category', 'aria-label': 'Filter by category' },
      opt('all', 'All categories (' + DATA.rows.length + ')', state.category === 'all'),
      cats.map(function (c) { return opt(c, c + ' (' + catCounts[c] + ')', state.category === c); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = h('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      opt('all', 'All chains (' + DATA.rows.length + ')', state.chain === 'all'),
      chains.map(function (c) { return opt(c, c + ' (' + chainCounts[c] + ')', state.chain === c); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var tvlSel = h('select', { id: 'tvl', 'aria-label': 'Filter by TVL' },
      opt('all', 'Any TVL (' + DATA.rows.length + ')', state.tvl === 'all'),
      [['g500', 'TVL $500M+'], ['100-500', 'TVL $100M–$500M'], ['50-100', 'TVL $50M–$100M'], ['lt50', 'TVL under $50M']].map(function (o) { return opt(o[0], o[1] + ' (' + tvlCounts[o[0]] + ')', state.tvl === o[0]); })
    );
    tvlSel.addEventListener('change', function () { state.tvl = tvlSel.value; writeHash(); render(); });
    var sortSel = h('select', { id: 'sort', 'aria-label': 'Sort the board' },
      [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7-day growth'], ['age', 'Age'], ['name', 'Name']].map(function (o) {
        return opt(o[0], 'Sort: ' + o[1], state.sort === o[0]);
      })
    );
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; state.dir = -1; writeHash(); render(); });
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
    return h('span', { class: 'tag tag-grey', text: 'Early' });
  }

  function boardTable() {
    var list = sorted(filtered());
    if (list.length === 0) {
      return h('div', { class: 'card' }, h('div', { class: 'empty' },
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search, turn off watchlist-only, or pick another category to see the board again.' }),
        h('button', { class: 'btn dark', type: 'button', text: 'Clear filters', onclick: clearFilters })
      ));
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var body = h('tbody');
    list.forEach(function (r) {
      var g = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
      body.appendChild(h('tr', {
        class: state.selected === r.slug ? 'sel' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        h('td', { class: 'num rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) }),
        h('td', null, h('div', { class: 'cell-name' },
          h('b', { text: r.name }),
          h('span', { class: 'cell-sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'one chain') })
        )),
        h('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        h('td', { class: 'num ' + gc, text: g }),
        h('td', { class: 'num', text: fmtAge(r.age_days) }),
        h('td', null, h('div', { class: 'implied-cell' },
          h('span', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          h('b', { class: 'num implied-val', text: fmtUsd(r.implied_value_usd) })
        )),
        h('td', { class: 'num rankrange', text: '#' + r.rank + ' [' + r.model.rank_lo + '–' + r.model.rank_hi + ']' }),
        h('td', null, statusTag(r))
      ));
    });
    return h('div', { class: 'card' }, h('div', { class: 'scroll' },
      h('table', null,
        h('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model, comparables and farm plan.' }),
        h('thead', null, h('tr', null,
          sortBtn('implied', 'Rank'), sortBtn('name', 'Protocol'), sortBtn('tvl', 'TVL'),
          sortBtn('growth', '7d'), sortBtn('age', 'Age'), sortBtn('implied', 'Implied value'),
          h('th', { scope: 'col', text: 'Rank range' }), h('th', { scope: 'col', text: 'Row' })
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
        h('caption', { text: 'Already trading: market cap is a fact here, not a model. These protocols are set aside from the pre-token ranking, and their mcap/TVL ratios are the comparables behind the model.' }),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col', text: 'Status' }), h('th', { scope: 'col', text: 'Protocol' }),
          h('th', { scope: 'col', text: 'TVL' }), h('th', { scope: 'col', text: '7d' }),
          h('th', { scope: 'col', text: 'Market cap' }), h('th', { scope: 'col', text: 'mcap / TVL' })
        )),
        body
      )
    ));
  }

  function validationSection() {
    var v = DATA.validation;
    if (!v || typeof v !== 'object') return null;
    var tiles = h('div', { class: 'vstats' });
    [
      ['Held-out RMSE (5-fold CV)', v.held_out_rmse.toFixed(3)],
      ['Held-out R\u00b2', v.held_out_r2.toFixed(3)],
      ['Baseline RMSE (flat multiple)', v.baseline_rmse.toFixed(3)],
      ['Walk-forward 2025-01-01 RMSE', v.walkforward_2025_01_01_model_rmse.toFixed(3) + ' vs ' + v.walkforward_2025_01_01_baseline_rmse.toFixed(3)],
      ['Walk-forward 2025-06-30 RMSE', v.walkforward_2025_06_30_model_rmse.toFixed(3) + ' vs ' + v.walkforward_2025_06_30_baseline_rmse.toFixed(3)],
      ['Fitted size slope (capped at -0.10)', String(v.size_curve_slope)]
    ].forEach(function (kv) {
      tiles.appendChild(h('div', { class: 'vstat' }, h('span', { text: kv[0] }), h('b', { text: kv[1] })));
    });
    return h('section', { class: 'card section' },
      h('h2', { text: 'Out-of-sample validation' }),
      h('p', { text: v.method }),
      tiles,
      h('p', { class: 'note', text: v.conclusion })
    );
  }

  function modelSection() {
    var m = DATA.model;
    var multRows = Object.keys(DATA.category_multiples).sort(function (a, b) {
      return DATA.category_multiples[b].multiple - DATA.category_multiples[a].multiple;
    }).map(function (cat) {
      var e = DATA.category_multiples[cat];
      var n = 0;
      DATA.categories.forEach(function (c) { if (c.category === cat) n = c.n; });
      return h('tr', null,
        h('td', null, h('b', { text: cat })),
        h('td', { class: 'num', text: e.multiple.toFixed(3) + 'x' }),
        h('td', null, e.basis),
        h('td', { class: 'num', text: String(n) })
      );
    });
    var rules = DATA.plausibility_rules.map(function (r) {
      return h('li', null, h('b', { text: 'x' + r.factor.toFixed(2) + ' — ' }), r.reason);
    });
    return h('div', null,
      h('section', { class: 'card section' },
        h('h2', { text: 'How implied value is computed' }),
        h('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased: the category table, the double-count table and the plausibility rules are data the function reads. The core is the category median mcap/TVL over the snapshot\u2019s own live-token comparables, times a capped size adjustment (slope -0.10, at most +/-15%): bigger TVL earns a lower multiple, but the adjustment can only nudge a row, never decide it.' }),
        h('div', { class: 'formula', text: 'implied = round( tvl_usd x M_cat x sizeAdj x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x chain x double-count x plausibility )' }),
        h('div', { class: 'grid2' },
          h('div', null,
            h('h3', { text: 'Category medians (mcap / TVL, winsorised live comps)' }),
            h('div', { class: 'scroll' }, h('table', { class: 'mini' },
              h('thead', null, h('tr', null, h('th', { text: 'Category' }), h('th', { text: 'Multiple' }), h('th', { text: 'Basis' }), h('th', { text: 'Comps' }))),
              h('tbody', null, multRows)
            )),
            h('p', { class: 'note', text: 'Unlisted categories use the overall median fallback, ' + DATA.fallback_multiple.multiple + 'x (' + DATA.fallback_multiple.basis + '). TVL is a size proxy, not revenue: the multiple prices size, the growth and maturity factors price momentum and time with no token.' })
          ),
          h('div', null,
            h('h3', { text: 'Plausibility rules' }),
            h('ol', { class: 'rules' }, rules),
            h('p', { class: 'note', text: 'Token already trades: USDD, dTAO (TAO), Plume Vaults (PLUME), Mezo Earn (MEZO). No token thesis: Lightning Network. Chain rows score 0.20 by the weak-thesis rule; Risk Curators score 0.50 by the private-firm rule. Everything else scores 1.00.' }),
            h('h3', { text: 'Other factors' }),
            h('p', { class: 'note', text: 'Chain breadth: 1 chain 1.00x, 2–3 chains 1.05x, 4–9 chains 1.10x, 10+ chains 1.15x. Double-count haircut: 0.50x Risk Curators and Onchain Capital Allocators, 0.75x Restaking, Collateral Markets and Staking Pools, 1.00x otherwise. Age unknown uses ' + m.unknown_age_days + ' days (the snapshot median). FDV range is implied x [2, 4] — a secondary line only, because the snapshot carries no supply data.' })
          )
        )
      ),
      validationSection()
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

  function valueCapture(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('rwa') >= 0) return 'Value capture: fees and spread on the tokenised yield asset, if a token launches';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Value capture: borrow-interest spread, if a token launches';
    if (c.indexOf('dex') >= 0) return 'Value capture: trading fees, if a token launches';
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Value capture: strategy and performance fees, if a token launches';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Value capture: staking and restaking fees, if a token launches';
    if (c.indexOf('basis') >= 0) return 'Value capture: basis-trade spread, if a token launches';
    return 'Value capture: protocol fees, if a token launches';
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
    var check = scoreRow(row.tvl_usd, m.category_multiple, m.size_adjustment, m.growth_pct, m.age_days, m.chain_count, m.double_count_multiplier, m.plausibility);
    var range = (m.range_low_usd !== null && m.range_high_usd !== null)
      ? fmtUsd(m.range_low_usd) + ' – ' + fmtUsd(m.range_high_usd) + ' (category p25–p75, n=' + m.comparables_n + ')'
      : 'n/a';
    var head = h('div', { class: 'panel-head' },
      h('div', null,
        h('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · rank range [' + m.rank_lo + '–' + m.rank_hi + ']' + (WATCH[row.slug] ? ' · watchlist' : ' · early radar') }),
        h('h2', { text: row.name }),
        h('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'one chain') + ' · records no token · ' + fmtAge(m.age_days) + ' with no token' })
      ),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: closeDetail })
    );
    panel.appendChild(head);
    panel.appendChild(h('div', { class: 'p-value' },
      h('span', { text: 'Implied value' }),
      h('b', { text: fmtUsd(row.implied_value_usd) }),
      h('span', { class: 'p-ranges', text: 'FDV ' + fmtUsd(m.fdv_low_usd) + ' – ' + fmtUsd(m.fdv_high_usd) + ' (x[2, 4]) · p25–p75 ' + range }),
      h('span', { class: 'p-basis', text: 'Category multiple ' + m.category_multiple.toFixed(3) + 'x — ' + m.category_multiple_basis })
    ));
    // 1) The working: every factor, then the equation with real numbers.
    var factors = h('div', { class: 'factors2' });
    [
      ['TVL', fmtUsd(row.tvl_usd)],
      ['Category multiple', m.category_multiple.toFixed(3) + 'x'],
      ['Size adjustment', 'x' + fmtMult(m.size_adjustment)],
      ['7-day growth', fmtPct(row.change_7d) + ' → x' + fmtMult(m.growth_multiplier)],
      ['Age / maturity', fmtAge(m.age_days) + ' → x' + fmtMult(m.maturity_multiplier)],
      ['Chains', m.chain_count + ' → x' + fmtMult(m.chain_multiplier)],
      ['Double-count', 'x' + fmtMult(m.double_count_multiplier)],
      ['Plausibility', 'x' + fmtMult(m.plausibility)]
    ].forEach(function (kv) {
      factors.appendChild(h('div', null, h('span', { text: kv[0] }), h('b', { text: kv[1] })));
    });
    panel.appendChild(h('section', { class: 'psec first' },
      h('h3', { text: 'Implied value — the working' }),
      factors,
      h('div', { class: 'working', text: fmtUsd(row.tvl_usd) + ' x ' + m.category_multiple.toFixed(3) + ' x ' + fmtMult(m.size_adjustment) + ' x ' + fmtMult(m.growth_multiplier) + ' x ' + fmtMult(m.maturity_multiplier) + ' x ' + fmtMult(m.chain_multiplier) + ' x ' + fmtMult(m.double_count_multiplier) + ' x ' + fmtMult(m.plausibility) + ' = ' + fmtUsd(row.implied_value_usd) }),
      h('p', { class: 'note', text: m.size_adjustment_basis + '. The page recomputes this row as ' + fmtUsd(check.implied) + (check.implied === row.implied_value_usd ? ', the same number the board carries.' : ', which differs from the board — the data would be stale.') + ' ' + valueCapture(row.category) + '.' }),
      h('p', { class: 'note blind', text: 'Blind test: CV log-RMSE ' + DATA.validation.held_out_rmse.toFixed(3) + ' (R\u00b2 ' + DATA.validation.held_out_r2.toFixed(2) + ') vs baseline ' + DATA.validation.baseline_rmse.toFixed(3) + '; walk-forward wins both splits.' })
    ));
    // 2) Comparables, picked for this row alone.
    var compBody = h('tbody');
    (m.comparables || []).slice(0, 4).forEach(function (c) {
      compBody.appendChild(h('tr', null,
        h('td', null, h('b', { text: c.name })),
        h('td', { class: 'num', text: c.ratio.toFixed(3) + 'x' }),
        h('td', { class: 'num', text: fmtUsd(c.mcap_usd) }),
        h('td', { class: 'num', text: fmtUsd(c.tvl_usd) })
      ));
    });
    panel.appendChild(h('section', { class: 'psec' },
      h('h3', { text: 'Comparables — ' + (row.category || 'Other') + ', nearest by TVL' }),
      h('p', { class: 'note', text: 'Live-token comps, mcap/TVL in (0, 3]: n=' + m.comparables_n + ', median ' + (m.comparables_median === null ? 'n/a' : m.comparables_median.toFixed(3) + 'x') + ' — the multiple above. Four nearest by TVL shown' + ((m.comparables || []).length > 4 ? '; 5th: ' + m.comparables[4].name + ' ' + m.comparables[4].ratio.toFixed(3) + 'x.' : '.') }),
      h('div', { class: 'scroll' }, h('table', { class: 'mini' },
        h('thead', null, h('tr', null, h('th', { text: 'Protocol' }), h('th', { text: 'mcap / TVL' }), h('th', { text: 'Market cap' }), h('th', { text: 'TVL' }))),
        compBody
      ))
    ));
    // 3) Farm plan, with its signal, its money line and its risk.
    var f = row.farm || {};
    var steps = h('ol', { class: 'steps' });
    row.farm_steps.forEach(function (s) {
      var p = parseStep(s);
      var chips = h('span', { class: 'schips' });
      if (p.cost) chips.appendChild(h('span', { class: 'schip', text: 'Cost: ' + p.cost }));
      if (p.time) chips.appendChild(h('span', { class: 'schip', text: 'Time: ' + p.time }));
      steps.appendChild(h('li', null, h('b', { text: p.action }), chips));
    });
    var econ = h('div', { class: 'econ' },
      h('div', null, h('span', { text: 'Deposit (recoverable)' }), h('b', { text: fmtUsd(f.capital_usd) })),
      h('div', null, h('span', { text: 'Gas (estimate)' }), h('b', { text: fmtUsd(f.gas_usd) })),
      h('div', null, h('span', { text: 'Expected yield, ' + (f.hold_days || '') + 'd at 3–8% APY' }), h('b', { text: fmtMoney(f.expected_yield_low_usd) + ' – ' + fmtMoney(f.expected_yield_high_usd) })),
      h('div', { class: 'hl' }, h('span', { text: 'Net after gas' }), h('b', { text: fmtMoney(f.net_low_usd) + ' – ' + fmtMoney(f.net_high_usd) }))
    );
    panel.appendChild(h('section', { class: 'psec' },
      h('h3', { text: 'Farm plan' }),
      h('p', { class: 'note', text: 'Signal: ' + (f.signal || '') }),
      econ,
      h('p', { class: 'note', text: 'Yield is illustrative at 3–8% APY, not a promise; points value is counted as $0. ' + (f.risk || '') }),
      steps
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
    wrap.appendChild(toolbar());
    wrap.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') wrap.appendChild(modelSection());
    wrap.appendChild(h('footer', { class: 'foot' },
      h('p', { text: 'Snapshot: DefiLlama protocol index, as of ' + DATA.as_of + ', floor $' + Math.round(DATA.floor_usd / 1e6) + 'M, ' + DATA.watchlist_size + ' watchlist protocols. TVL moves with prices; the same capital is counted in several protocols (receipt-token restaking); adapters are often written by the protocol itself. Listed date is when DefiLlama started tracking, a maturity proxy, not a launch date.' }),
      h('p', { text: 'A token-less listing is not a promise of a token. Farm plans name costs and times; where no live program exists the plan says so. Never pay to claim, and claim only from the protocol\u2019s own published link.' })
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
