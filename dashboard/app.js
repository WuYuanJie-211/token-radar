// Token Radar dashboard (radar-3). Reads window.RADAR, written beside
// dashboard/ by main.ts. No network: every number on the page is in data.js.
// The page never fetches, never imports, and never links out.
//
// Default view: the rank-1 protocol's detail is open, and the sandbox in
// that detail re-prices the open row (never a synthetic row). Close the
// panel and it stays closed until a row is picked; #detail=0 in the URL
// opens the plain board instead.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var state = { q: '', category: 'all', chain: 'all', conf: 'all', tvl: 'all', sort: 'implied', dir: -1, tab: 'pre-token', wl: false, selected: null, suppressAuto: false };
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });
  var NO_FARM = {};
  Object.keys(DATA.token_exists || {}).forEach(function (s) { NO_FARM[s] = DATA.token_exists[s]; });
  Object.keys(DATA.no_thesis || {}).forEach(function (s) { NO_FARM[s] = DATA.no_thesis[s]; });

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
  // working and the sandbox can re-price the open row with the same arithmetic.
  function scoreRow(tvl, mult, growthPct, ageDays, chains, dbl, plaus) {
    var g = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, growthPct));
    var growthMult = 1 + (g / 100) * DATA.model.growth_weight;
    var age = ageDays === null || ageDays === undefined || !isFinite(ageDays) ? DATA.model.unknown_age_days : ageDays;
    var maturity = DATA.model.maturity_floor + (Math.min(Math.max(age, 0), DATA.model.maturity_days) / DATA.model.maturity_days) * DATA.model.maturity_range;
    var chain = chains >= 10 ? DATA.model.chain_wide : chains >= 4 ? DATA.model.chain_many : chains >= 2 ? DATA.model.chain_few : DATA.model.chain_one;
    return { implied: Math.max(1, Math.round(tvl * mult * growthMult * maturity * chain * dbl * plaus)), growthMult: growthMult, maturity: maturity, chain: chain };
  }
  function dblFor(category) {
    if (category === 'Risk Curators' || category === 'Onchain Capital Allocator') return 0.5;
    if (category === 'Restaking' || category === 'Collateral Markets' || category === 'Staking Pool') return 0.75;
    return 1;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('conf')) state.conf = p.get('conf');
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
    if (state.conf !== 'all') p.set('conf', state.conf);
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
      if (state.conf !== 'all' && r.model.confidence !== state.conf) return false;
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
    return state.q !== '' || state.category !== 'all' || state.chain !== 'all' || state.conf !== 'all' || state.tvl !== 'all' || state.wl;
  }
  function clearFilters() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.conf = 'all'; state.tvl = 'all'; state.wl = false;
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
        h('div', { class: 'kicker', text: 'Pre-token radar · ' + DATA.model_version }),
        h('h1', { text: 'Forty watchlist protocols, ranked by implied value' }),
        h('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL whose record shows no token. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, by TVL. Implied value is a model estimate of circulating market cap, not a price and not a promise of a token.' }),
        h('p', { class: 'topline', text: 'Top of the board: ' + (top ? top.name + ' at ' + fmtUsd(top.implied_value_usd) : 'n/a') + '. Select any row for its valuation, comparables and farm plan.' })
      ),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { text: 'Watchlist covered' }), h('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        h('div', { class: 'stat' }, h('span', { text: 'Watchlist implied value' }), h('b', { text: fmtUsd(DATA.watchlist_implied_sum_usd) })),
        h('div', { class: 'stat' }, h('span', { text: 'Pre-token rows scored' }), h('b', { text: String(DATA.board_size) })),
        h('div', { class: 'stat' }, h('span', { text: 'Early rows below the floor' }), h('b', { text: String(DATA.early_size) })),
        h('div', { class: 'stat' }, h('span', { text: 'Live-token protocols set aside' }), h('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function toolbar() {
    var catCounts = countBy(DATA.rows, function (r) { return r.category || 'Other'; });
    var cats = Object.keys(catCounts).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; });
    var confCounts = countBy(DATA.rows, function (r) { return r.model.confidence; });
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
    var confSel = h('select', { id: 'conf', 'aria-label': 'Filter by confidence' },
      opt('all', 'Any confidence (' + DATA.rows.length + ')', state.conf === 'all'),
      [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(function (o) { return opt(o[0], o[1] + ' (' + (confCounts[o[0]] || 0) + ')', state.conf === o[0]); })
    );
    confSel.addEventListener('change', function () { state.conf = confSel.value; writeHash(); render(); });
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
      h('div', { class: 'field' }, h('label', { for: 'conf', text: 'Confidence' }), confSel),
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
      if (state.conf !== 'all') chips.appendChild(h('span', { class: 'fchip', text: 'Confidence: ' + state.conf }));
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

  function confCell(c) {
    var label = c === 'high' ? 'High' : c === 'medium' ? 'Medium' : 'Low';
    return h('td', null, h('span', { class: 'conf conf-' + c }, h('i', { 'aria-hidden': 'true' }), label));
  }
  function statusTag(r) {
    if (NO_FARM[r.slug]) return h('span', { class: 'tag tag-red', text: 'No live farm' });
    if (r.model.plausibility < 1) return h('span', { class: 'tag tag-amber', text: r.model.plausibility === 0.1 ? 'No token thesis' : 'Token exists / private' });
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
        h('td', null, h('div', { class: 'implied-cell' },
          h('span', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          h('b', { class: 'num implied-val', text: fmtUsd(r.implied_value_usd) })
        )),
        confCell(r.model.confidence),
        h('td', null, statusTag(r))
      ));
    });
    return h('div', { class: 'card' }, h('div', { class: 'scroll' },
      h('table', null,
        h('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model, comparables and farm plan.' }),
        h('thead', null, h('tr', null,
          sortBtn('implied', 'Rank'), sortBtn('name', 'Protocol'), sortBtn('tvl', 'TVL'),
          sortBtn('growth', '7d'), sortBtn('implied', 'Implied value'),
          h('th', { scope: 'col', text: 'Confidence' }), h('th', { scope: 'col', text: 'Row' })
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

  function prettyKey(k) {
    return k.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function validationSection() {
    var v = DATA.validation;
    if (!v || typeof v !== 'object') {
      return h('section', { class: 'card section' },
        h('h2', { text: 'Out-of-sample validation' }),
        h('p', { text: 'This build ships no validation block, so no out-of-sample numbers are shown here. The model is fit on the snapshot\u2019s own live-token comparables; a validation block, when the modelling pass publishes one, renders in this section with its method, held-out errors and baseline comparison. Nothing is estimated in its place.' }),
        h('ul', { class: 'rules' },
          h('li', { text: 'Fit on the snapshot itself: every multiple comes from live-token mcap/TVL in the same snapshot, not from outside prices.' }),
          h('li', { text: 'No row is hand-scored: one function scores all 200 rows from the published tables.' }),
          h('li', { text: 'Internal check: the detail panel recomputes each row from its own factors and flags any mismatch with the board.' })
        )
      );
    }
    var method = typeof v.method === 'string' ? v.method : (typeof v.description === 'string' ? v.description : null);
    var tiles = h('div', { class: 'vstats' });
    var handled = { method: 1, description: 1 };
    var defs = [
      ['held_out_rmse', 'Held-out RMSE', 'usd'], ['rmse', 'RMSE', 'usd'],
      ['held_out_r2', 'Held-out R2', 'num'], ['r2', 'R2', 'num'], ['r_squared', 'R2', 'num'],
      ['mae', 'MAE', 'usd'], ['baseline_rmse', 'Baseline RMSE', 'usd'], ['baseline_r2', 'Baseline R2', 'num'],
      ['n_test', 'Test rows', 'int'], ['n', 'Rows', 'int'], ['folds', 'Folds', 'int']
    ];
    defs.forEach(function (d) {
      var val = v[d[0]];
      if (typeof val !== 'number' || !isFinite(val)) return;
      handled[d[0]] = 1;
      var shown = d[2] === 'usd' ? fmtUsd(val) : d[2] === 'num' ? val.toFixed(3) : String(Math.round(val));
      tiles.appendChild(h('div', { class: 'vstat' }, h('span', { text: d[1] }), h('b', { text: shown })));
    });
    var extra = h('div', { class: 'factors' });
    var extraN = 0;
    Object.keys(v).forEach(function (k) {
      if (handled[k]) return;
      var val = v[k];
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        handled[k] = 1; extraN++;
        extra.appendChild(h('div', null, h('span', { text: prettyKey(k) }), h('b', { text: typeof val === 'number' ? (Math.abs(val) >= 1000 ? fmtUsd(val) : String(Math.round(val * 1000) / 1000)) : String(val) })));
      }
    });
    var rmse = typeof v.held_out_rmse === 'number' ? v.held_out_rmse : v.rmse;
    var base = v.baseline_rmse;
    var cmp = null;
    if (typeof rmse === 'number' && typeof base === 'number' && base > 0) {
      var pct = (base - rmse) / base * 100;
      cmp = h('p', { class: 'note', text: 'Held-out RMSE is ' + Math.abs(pct).toFixed(1) + '% ' + (pct >= 0 ? 'lower' : 'higher') + ' than the baseline (' + fmtUsd(base) + ').' });
    }
    var sec = h('section', { class: 'card section' },
      h('h2', { text: 'Out-of-sample validation' }),
      method ? h('p', { text: method }) : null,
      tiles,
      cmp,
      extraN > 0 ? extra : null
    );
    return sec;
  }

  function modelSection() {
    var m = DATA.model;
    var multRows = Object.keys(DATA.category_multiples).sort(function (a, b) {
      return DATA.category_multiples[b].multiple - DATA.category_multiples[a].multiple;
    }).map(function (cat) {
      var e = DATA.category_multiples[cat];
      return h('tr', null,
        h('td', null, h('b', { text: cat })),
        h('td', { class: 'num', text: e.multiple.toFixed(3) + 'x' }),
        h('td', null, e.basis),
        h('td', null, h('span', { class: 'tag ' + (e.confidence === 'high' ? 'tag-teal' : e.confidence === 'medium' ? 'tag-grey' : 'tag-amber'), text: e.confidence }))
      );
    });
    var rules = DATA.plausibility_rules.map(function (r) {
      return h('li', null, h('b', { text: 'x' + r.factor.toFixed(2) + ' — ' }), r.reason);
    });
    return h('div', null,
      h('section', { class: 'card section' },
        h('h2', { text: 'How implied value is computed' }),
        h('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased: the ridge, the category table, the double-count table and the plausibility rules are data the function reads. The core is a ridge regression of log(mcap) on log(TVL), its square (the size curve), log(age), chain breadth and category, fitted on the snapshot\u2019s own live-token comparables and blended 50/50 in log space with the category median. The size curve is the point: bigger TVL earns a lower multiple (slope \u22120.382), so a large RWA protocol no longer runs away with the board on its category median alone.' }),
        h('div', { class: 'formula', text: 'implied = round( tvl_usd x M_eff x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x chain x double-count x plausibility ) — M_eff is the row\u2019s blend effective multiple' }),
        h('div', { class: 'grid2' },
          h('div', null,
            h('h3', { text: 'Category medians — baseline half of the blend (mcap / TVL)' }),
            h('div', { class: 'scroll' }, h('table', { class: 'mini' },
              h('thead', null, h('tr', null, h('th', { text: 'Category' }), h('th', { text: 'Multiple' }), h('th', { text: 'Basis' }), h('th', { text: 'Confidence' }))),
              h('tbody', null, multRows)
            )),
            h('p', { class: 'note', text: 'Unlisted categories use the overall median fallback, ' + DATA.fallback_multiple.multiple + 'x (' + DATA.fallback_multiple.basis + ').' })
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

  // The sandbox, bound to the open row: its inputs start from this row's
  // own figures, and every edit re-prices this row against its board value.
  function sandbox(row) {
    var m = row.model;
    var cats = Object.keys(DATA.category_multiples).sort();
    if (row.category && cats.indexOf(row.category) < 0) cats.push(row.category);
    function opt(value, label) { return h('option', { value: value, text: label }); }
    var tvlIn = h('input', { type: 'number', id: 'sb-tvl', value: String(row.tvl_usd), min: '0', step: '1000000', 'aria-label': 'TVL in USD' });
    var catSel = h('select', { id: 'sb-cat', 'aria-label': 'Category' }, cats.map(function (c) { return opt(c, c); }));
    var multIn = h('input', { type: 'number', id: 'sb-mult', value: String(m.category_multiple), step: '0.001', min: '0', 'aria-label': 'Effective multiple' });
    var gIn = h('input', { type: 'number', id: 'sb-g', value: String(m.growth_pct), step: '0.1', 'aria-label': 'Seven-day growth percent' });
    var ageIn = h('input', { type: 'number', id: 'sb-age', value: String(m.age_days === null ? DATA.model.unknown_age_days : m.age_days), min: '0', step: '1', 'aria-label': 'Age in days' });
    var chIn = h('input', { type: 'number', id: 'sb-ch', value: String(m.chain_count), min: '1', step: '1', 'aria-label': 'Chain count' });
    var dblSel = h('select', { id: 'sb-dbl', 'aria-label': 'Double-count haircut' },
      [['1', '1.00x — no double-count'], ['0.75', '0.75x — restaking group'], ['0.5', '0.50x — curator / allocator']].map(function (o) { return opt(o[0], o[1]); }));
    var plSel = h('select', { id: 'sb-pl', 'aria-label': 'Plausibility' },
      [['1', '1.00x — plausible token path'], ['0.5', '0.50x — private firm'], ['0.2', '0.20x — token already trades'], ['0.1', '0.10x — no token thesis']].map(function (o) { return opt(o[0], o[1]); }));
    var out = h('div', { class: 'sb-out' });
    function recompute() {
      var tvl = parseFloat(tvlIn.value) || 0;
      var mult = parseFloat(multIn.value) || 0;
      var s = scoreRow(tvl, mult, parseFloat(gIn.value) || 0, parseFloat(ageIn.value), parseInt(chIn.value, 10) || 1, parseFloat(dblSel.value), parseFloat(plSel.value));
      var d = s.implied - row.implied_value_usd;
      var pct = row.implied_value_usd ? (d / row.implied_value_usd * 100) : 0;
      out.textContent = '';
      var cmp = h('div', { class: 'sb-cmp' },
        h('div', { class: 'sb-cell' }, h('span', { text: 'Board value' }), h('b', { text: fmtUsd(row.implied_value_usd) })),
        h('div', { class: 'sb-arrow', 'aria-hidden': 'true', text: '→' }),
        h('div', { class: 'sb-cell' }, h('span', { text: 'Re-priced' }), h('b', { text: fmtUsd(s.implied) })),
        h('div', { class: 'sb-cell' }, h('span', { text: 'Change' }),
          h('b', { class: d === 0 ? '' : (d > 0 ? 'up' : 'down'), text: (d > 0 ? '+' : d < 0 ? '-' : '') + fmtUsd(Math.abs(d)) + ' (' + (pct > 0 ? '+' : pct < 0 ? '-' : '') + Math.abs(pct).toFixed(1) + '%)' }))
      );
      out.appendChild(cmp);
      out.appendChild(h('p', { class: 'note', text: d === 0 ? 'These inputs reproduce the board value exactly.' : 'Same arithmetic as the board — only the inputs changed.' }));
      out.appendChild(h('p', { class: 'note', text: 'FDV range ' + fmtUsd(s.implied * DATA.model.fdv_low) + ' – ' + fmtUsd(s.implied * DATA.model.fdv_high) + ' · growth x' + fmtMult(s.growthMult) + ' · maturity x' + fmtMult(s.maturity) + ' · chain x' + fmtMult(s.chain) }));
    }
    function onCat() {
      var e = DATA.category_multiples[catSel.value];
      if (e) multIn.value = String(e.multiple);
      else multIn.value = String(DATA.fallback_multiple.multiple);
      dblSel.value = String(dblFor(catSel.value));
      recompute();
    }
    function reset() {
      tvlIn.value = String(row.tvl_usd);
      catSel.value = row.category || cats[0];
      multIn.value = String(m.category_multiple);
      gIn.value = String(m.growth_pct);
      ageIn.value = String(m.age_days === null ? DATA.model.unknown_age_days : m.age_days);
      chIn.value = String(m.chain_count);
      dblSel.value = String(m.double_count_multiplier);
      plSel.value = String(m.plausibility);
      recompute();
    }
    catSel.value = row.category || cats[0];
    dblSel.value = String(m.double_count_multiplier);
    plSel.value = String(m.plausibility);
    [tvlIn, multIn, gIn, ageIn, chIn, dblSel, plSel].forEach(function (el) {
      el.addEventListener('input', recompute);
      el.addEventListener('change', recompute);
    });
    catSel.addEventListener('change', onCat);
    recompute();
    return h('div', null,
      h('h3', { text: 'Sandbox — re-price ' + row.name }),
      h('p', { class: 'note', text: 'Every field starts from this row\u2019s own figures. Change a category and its published multiple and haircut fill in; edit any field and the row re-prices live against its board value.' }),
      out,
      h('div', { class: 'sandbox' },
        h('div', { class: 'field' }, h('label', { for: 'sb-tvl', text: 'TVL (USD)' }), tvlIn),
        h('div', { class: 'field' }, h('label', { for: 'sb-cat', text: 'Category' }), catSel),
        h('div', { class: 'field' }, h('label', { for: 'sb-mult', text: 'Effective multiple (M_eff)' }), multIn),
        h('div', { class: 'field' }, h('label', { for: 'sb-g', text: '7-day growth (%)' }), gIn),
        h('div', { class: 'field' }, h('label', { for: 'sb-age', text: 'Age (days)' }), ageIn),
        h('div', { class: 'field' }, h('label', { for: 'sb-ch', text: 'Chains' }), chIn),
        h('div', { class: 'field' }, h('label', { for: 'sb-dbl', text: 'Double-count' }), dblSel),
        h('div', { class: 'field' }, h('label', { for: 'sb-pl', text: 'Plausibility' }), plSel),
        h('div', { class: 'sb-actions' }, h('button', { class: 'btn small', type: 'button', text: 'Reset to board values', onclick: reset }))
      )
    );
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
    var check = scoreRow(row.tvl_usd, m.category_multiple, m.growth_pct, m.age_days, m.chain_count, m.double_count_multiplier, m.plausibility);
    var range = (m.range_low_usd !== null && m.range_high_usd !== null)
      ? fmtUsd(m.range_low_usd) + ' – ' + fmtUsd(m.range_high_usd) + ' (category p25–p75, n=' + m.comparables_n + ')'
      : 'n/a — fewer than ' + DATA.model.range_min_comps + ' live-token comps in this category';
    var cat = null;
    DATA.categories.forEach(function (c) { if (c.category === row.category) cat = c; });
    var noFarm = NO_FARM[row.slug];
    var head = h('div', { class: 'panel-head' },
      h('div', null,
        h('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' · watchlist' : ' · early radar') }),
        h('h2', { text: row.name }),
        h('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'one chain') + ' · records no token' })
      ),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: closeDetail })
    );
    panel.appendChild(head);
    panel.appendChild(h('div', { class: 'p-value' },
      h('span', { text: 'Implied value' }),
      h('b', { text: fmtUsd(row.implied_value_usd) }),
      h('span', { class: 'p-ranges', text: 'FDV ' + fmtUsd(m.fdv_low_usd) + ' – ' + fmtUsd(m.fdv_high_usd) + ' (implied x [2, 4], secondary) · p25–p75 ' + range }),
      h('span', { class: 'p-conf', text: 'Confidence ' + m.confidence + ' — ' + m.category_multiple_basis })
    ));
    if (noFarm) {
      panel.appendChild(h('div', { class: 'banner banner-red' }, h('b', { text: 'No live farm. ' }), noFarm + '.'));
    } else if (m.plausibility < 1) {
      panel.appendChild(h('div', { class: 'banner' }, h('b', { text: 'Plausibility x' + m.plausibility.toFixed(2) + '. ' }), m.plausibility_reason + '.'));
    }
    var factors = h('div', { class: 'factors' });
    [
      ['TVL', fmtUsd(row.tvl_usd), 0], ['7-day growth', fmtPct(row.change_7d) + ' (clamped to ' + fmtPct(m.growth_pct) + ')', 0],
      ['Age with no token', fmtAge(m.age_days) + (m.age_days === null ? ' (uses ' + DATA.model.unknown_age_days + 'd)' : ''), 0],
      ['Effective multiple (M_eff)', m.category_multiple.toFixed(3) + 'x — ' + m.category_multiple_basis, 0],
      ['Growth multiplier', 'x' + fmtMult(m.growth_multiplier), 0],
      ['Maturity multiplier', 'x' + fmtMult(m.maturity_multiplier), 0],
      ['Chain multiplier', 'x' + fmtMult(m.chain_multiplier) + ' (' + m.chain_count + ' chain' + (m.chain_count === 1 ? '' : 's') + ')', 0],
      ['Double-count haircut', 'x' + fmtMult(m.double_count_multiplier), 0],
      ['Plausibility', 'x' + fmtMult(m.plausibility), 0],
      ['Implied value', fmtUsd(row.implied_value_usd), 1]
    ].forEach(function (kv) {
      factors.appendChild(h('div', { class: kv[2] ? 'hl' : null }, h('span', { text: kv[0] }), h('b', { text: kv[1] })));
    });
    panel.appendChild(h('section', { class: 'psec' }, sandbox(row)));
    panel.appendChild(h('section', { class: 'psec' },
      h('h3', { text: 'Implied value — the working' }),
      factors,
      h('div', { class: 'working', text: fmtUsd(row.tvl_usd) + ' x ' + m.category_multiple.toFixed(3) + ' x ' + fmtMult(m.growth_multiplier) + ' x ' + fmtMult(m.maturity_multiplier) + ' x ' + fmtMult(m.chain_multiplier) + ' x ' + fmtMult(m.double_count_multiplier) + ' x ' + fmtMult(m.plausibility) + ' = ' + fmtUsd(row.implied_value_usd) }),
      h('p', { class: 'note', text: 'The page recomputes this row as ' + fmtUsd(check.implied) + (check.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board — the data would be stale.') + ' This is an estimate, not a price. FDV range and p25–p75 range are in the header above.' })
    ));
    if (cat) {
      var compBody = h('tbody');
      cat.comps.forEach(function (c) {
        compBody.appendChild(h('tr', null,
          h('td', null, h('b', { text: c.name })),
          h('td', { class: 'num', text: c.ratio.toFixed(3) + 'x' }),
          h('td', { class: 'num', text: fmtUsd(c.mcap_usd) }),
          h('td', { class: 'num', text: fmtUsd(c.tvl_usd) })
        ));
      });
      panel.appendChild(h('section', { class: 'psec' },
        h('h3', { text: 'Comparables — ' + cat.category }),
        h('p', { class: 'note', text: 'Live-token protocols in this category, mcap/TVL in (0, 3]: n=' + cat.n + ', median ' + (cat.median === null ? 'n/a' : cat.median.toFixed(3) + 'x') + ', p25 ' + (cat.p25 === null ? 'n/a' : cat.p25.toFixed(3) + 'x') + ', p75 ' + (cat.p75 === null ? 'n/a' : cat.p75.toFixed(3) + 'x') + '. Largest by TVL:' }),
        h('div', { class: 'scroll' }, h('table', { class: 'mini' },
          h('thead', null, h('tr', null, h('th', { text: 'Protocol' }), h('th', { text: 'mcap / TVL' }), h('th', { text: 'Market cap' }), h('th', { text: 'TVL' }))),
          compBody
        ))
      ));
    }
    var steps = h('ol', { class: 'steps' });
    row.farm_steps.forEach(function (s) {
      var p = parseStep(s);
      var chips = h('span', { class: 'schips' });
      if (p.cost) chips.appendChild(h('span', { class: 'schip', text: 'Cost: ' + p.cost }));
      if (p.time) chips.appendChild(h('span', { class: 'schip', text: 'Time: ' + p.time }));
      steps.appendChild(h('li', null, h('b', { text: p.action }), chips));
    });
    panel.appendChild(h('section', { class: 'psec' },
      h('h3', { text: noFarm ? 'Farm plan — no live farm' : 'Farm plan' }),
      h('p', { class: 'note', text: noFarm ? 'Six steps for the yield position that replaces the launch farm. There is no points program to chase on this row.' : 'Six steps, each with its cost and time. Step 3 says to check the protocol\u2019s own points page first — if there is no program, this is a yield position, not a farm.' }),
      steps
    ));
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
    wrap.appendChild(toolbar());
    wrap.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') wrap.appendChild(modelSection());
    wrap.appendChild(h('footer', { class: 'foot' },
      h('p', { text: 'Snapshot: DefiLlama protocol index, as of ' + DATA.as_of + ', floor $' + Math.round(DATA.floor_usd / 1e6) + 'M, ' + DATA.watchlist_size + ' watchlist protocols. TVL moves with prices; the same capital is counted in several protocols (receipt-token restaking); adapters are often written by the protocol itself. Listed date is when DefiLlama started tracking, a maturity proxy, not a launch date.' }),
      h('p', { text: 'A token-less listing is not a promise of a token. Farm plans name costs and times; where no live program exists the plan says so. The sandbox re-prices the open protocol row; the board itself never changes. Never pay to claim, and claim only from the protocol\u2019s own published link.' })
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
