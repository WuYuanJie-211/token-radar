// Token Radar dashboard (radar-2). Reads window.RADAR, written beside
// dashboard/ by main.ts. No network: every number on the page is in data.js.
// The page never fetches, never imports, and never links out.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var state = { q: '', category: 'all', sort: 'implied', dir: -1, tab: 'pre-token', wl: false, selected: null };
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
  // working and the sandbox can re-price any inputs with the same arithmetic.
  function scoreRow(tvl, mult, growthPct, ageDays, chains, dbl, plaus) {
    var g = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, growthPct));
    var growthMult = 1 + (g / 100) * DATA.model.growth_weight;
    var age = ageDays === null || ageDays === undefined ? DATA.model.unknown_age_days : ageDays;
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
    if (p.get('sort')) state.sort = p.get('sort');
    if (p.get('p')) state.selected = p.get('p');
    if (p.get('tab') === 'live') state.tab = 'live';
    if (p.get('wl') === '1') state.wl = true;
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.tab === 'live') p.set('tab', 'live');
    if (state.wl) p.set('wl', '1');
    if (state.selected) p.set('p', state.selected);
    var next = p.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
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
    return h('section', { class: 'hero' },
      h('div', null,
        h('div', { class: 'kicker', text: 'Pre-token radar · ' + DATA.model_version }),
        h('h1', { text: 'Forty watchlist protocols, ranked by implied value' }),
        h('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL whose record shows no token. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, by TVL. Implied value is a model estimate of circulating market cap, not a price and not a promise of a token.' })
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
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = h('input', { type: 'search', id: 'q', placeholder: 'Search name or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = h('select', { id: 'category', 'aria-label': 'Filter by category' },
      h('option', { value: 'all', text: 'All categories' }),
      cats.map(function (c) { return h('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var sortSel = h('select', { id: 'sort', 'aria-label': 'Sort the board' },
      [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7-day growth'], ['age', 'Age'], ['name', 'Name']].map(function (o) {
        return h('option', { value: o[0], text: 'Sort: ' + o[1], selected: state.sort === o[0] ? 'selected' : null });
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
    return h('div', { class: 'toolbar', id: 'board-wrap' },
      h('div', { class: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'field' }, h('label', { for: 'category', text: 'Category' }), select),
      h('div', { class: 'field' }, h('label', { for: 'sort', text: 'Sort' }), sortSel),
      h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Token status' }), h('div', { class: 'seg' }, pre, live)),
      wl,
      h('span', { class: 'shown', text: state.tab === 'pre-token' ? list.length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
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

  function boardTable() {
    var list = sorted(filtered());
    if (list.length === 0) {
      return h('div', { class: 'card' }, h('div', { class: 'empty' },
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search, turn off watchlist-only, or pick another category to see the board again.' }),
        h('button', { class: 'btn dark', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.wl = false; writeHash(); render(); } })
      ));
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var body = h('tbody');
    list.forEach(function (r) {
      var g = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
      var tag = r.model.plausibility < 1
        ? h('span', { class: 'tag tag-amber', text: r.model.plausibility === 0.1 ? 'no token thesis' : 'token exists / private' })
        : WATCH[r.slug] ? h('span', { class: 'tag tag-teal', text: 'watchlist' }) : h('span', { class: 'tag tag-grey', text: 'early' });
      body.appendChild(h('tr', {
        class: state.selected === r.slug ? 'sel' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        h('td', { class: 'num', text: String(r.rank) }),
        h('td', null, h('div', { class: 'cell-name' },
          h('b', { text: r.name }),
          h('span', { class: 'cell-sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'one chain') })
        )),
        h('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        h('td', { class: 'num ' + gc, text: g }),
        h('td', { class: 'num', text: fmtAge(r.age_days) }),
        h('td', null, h('div', { class: 'implied-cell' },
          h('span', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          h('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        h('td', null, tag)
      ));
    });
    return h('div', { class: 'card' }, h('div', { class: 'scroll' },
      h('table', null,
        h('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model, comparables and farm plan.' }),
        h('thead', null, h('tr', null,
          sortBtn('implied', 'Rank'), sortBtn('name', 'Protocol'), sortBtn('tvl', 'TVL'),
          sortBtn('growth', '7d'), sortBtn('age', 'Age'), sortBtn('implied', 'Implied value'),
          h('th', { scope: 'col', text: 'Row' })
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
    return h('section', { class: 'card section' },
      h('h2', { text: 'How implied value is computed' }),
      h('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased: the category table, the double-count table and the plausibility rules are data the function reads. RWA dominates the top of the board because its multiple (0.275x) is about eleven times restaking\u2019s (0.025x) — that spread is the point of category multiples.' }),
      h('div', { class: 'formula', text: 'implied = round( tvl_usd x M_cat x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x chain x double-count x plausibility )' }),
      h('div', { class: 'grid2' },
        h('div', null,
          h('h3', { text: 'Category multiples (mcap / TVL)' }),
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
      ),
      sandbox()
    );
  }

  function sandbox() {
    var cats = Object.keys(DATA.category_multiples).sort();
    var tvlIn = h('input', { type: 'number', id: 'sb-tvl', value: '100000000', min: '0', step: '1000000', 'aria-label': 'TVL in USD' });
    var catSel = h('select', { id: 'sb-cat', 'aria-label': 'Category' }, cats.map(function (c) { return h('option', { value: c, text: c }); }));
    var multIn = h('input', { type: 'number', id: 'sb-mult', value: DATA.category_multiples['RWA'].multiple, step: '0.001', min: '0', 'aria-label': 'Category multiple' });
    var gIn = h('input', { type: 'number', id: 'sb-g', value: '0', step: '0.1', 'aria-label': 'Seven-day growth percent' });
    var ageIn = h('input', { type: 'number', id: 'sb-age', value: '512', min: '0', step: '1', 'aria-label': 'Age in days' });
    var chIn = h('input', { type: 'number', id: 'sb-ch', value: '1', min: '1', step: '1', 'aria-label': 'Chain count' });
    var dblSel = h('select', { id: 'sb-dbl', 'aria-label': 'Double-count haircut' },
      [['1', '1.00x — no double-count'], ['0.75', '0.75x — restaking group'], ['0.5', '0.50x — curator / allocator']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var plSel = h('select', { id: 'sb-pl', 'aria-label': 'Plausibility' },
      [['1', '1.00x — plausible token path'], ['0.5', '0.50x — private firm'], ['0.2', '0.20x — token already trades'], ['0.1', '0.10x — no token thesis']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var out = h('div', { class: 'sandbox-out' });
    function recompute() {
      var tvl = parseFloat(tvlIn.value) || 0;
      var mult = parseFloat(multIn.value) || 0;
      var s = scoreRow(tvl, mult, parseFloat(gIn.value) || 0, parseFloat(ageIn.value), parseInt(chIn.value, 10) || 1, parseFloat(dblSel.value), parseFloat(plSel.value));
      out.textContent = '';
      out.appendChild(h('span', { text: 'Implied value' }));
      out.appendChild(h('b', { text: fmtUsd(s.implied) }));
      out.appendChild(h('span', { text: 'FDV range ' + fmtUsd(s.implied * DATA.model.fdv_low) + ' – ' + fmtUsd(s.implied * DATA.model.fdv_high) }));
      out.appendChild(h('span', { text: 'growth x' + fmtMult(s.growthMult) + ' · maturity x' + fmtMult(s.maturity) + ' · chain x' + fmtMult(s.chain) }));
    }
    function onCat() {
      var e = DATA.category_multiples[catSel.value];
      if (e) multIn.value = String(e.multiple);
      dblSel.value = String(dblFor(catSel.value));
      recompute();
    }
    catSel.value = 'RWA';
    [tvlIn, catSel, multIn, gIn, ageIn, chIn, dblSel, plSel].forEach(function (el) {
      el.addEventListener('input', recompute);
      el.addEventListener('change', recompute);
    });
    catSel.addEventListener('change', onCat);
    recompute();
    return h('div', null,
      h('h3', { text: 'Model sandbox — re-price any protocol' }),
      h('p', { class: 'note', text: 'Change a category and its published multiple, haircut and plausibility fill in; edit any field and the implied value recomputes with the same arithmetic as the board.' }),
      h('div', { class: 'sandbox' },
        h('div', { class: 'field' }, h('label', { for: 'sb-tvl', text: 'TVL (USD)' }), tvlIn),
        h('div', { class: 'field' }, h('label', { for: 'sb-cat', text: 'Category' }), catSel),
        h('div', { class: 'field' }, h('label', { for: 'sb-mult', text: 'Category multiple' }), multIn),
        h('div', { class: 'field' }, h('label', { for: 'sb-g', text: '7-day growth (%)' }), gIn),
        h('div', { class: 'field' }, h('label', { for: 'sb-age', text: 'Age (days)' }), ageIn),
        h('div', { class: 'field' }, h('label', { for: 'sb-ch', text: 'Chains' }), chIn),
        h('div', { class: 'field' }, h('label', { for: 'sb-dbl', text: 'Double-count' }), dblSel),
        h('div', { class: 'field' }, h('label', { for: 'sb-pl', text: 'Plausibility' }), plSel),
        out
      )
    );
  }

  var scrim = h('div', { class: 'scrim', hidden: '', onclick: closeDetail });
  var panel = h('aside', { class: 'panel', hidden: '', 'aria-label': 'Protocol detail' });
  function closeDetail() {
    state.selected = null;
    panel.setAttribute('hidden', '');
    scrim.setAttribute('hidden', '');
    writeHash();
    render();
  }
  function splitStep(s) {
    var at = s.indexOf(' Cost: ');
    var action = at >= 0 ? s.slice(0, at) : s;
    var tail = at >= 0 ? s.slice(at + 1) : '';
    return { action: action, tail: tail };
  }
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    panel.textContent = '';
    var m = row.model;
    var check = scoreRow(row.tvl_usd, m.category_multiple, m.growth_pct, m.age_days, m.chain_count, m.double_count_multiplier, m.plausibility);
    var range = (m.range_low_usd !== null && m.range_high_usd !== null)
      ? fmtUsd(m.range_low_usd) + ' – ' + fmtUsd(m.range_high_usd) + ' (category p25–p75, n=' + m.comparables_n + ')'
      : 'n/a — fewer than ' + DATA.model.range_min_comps + ' live-token comps in this category';
    var cat = null;
    DATA.categories.forEach(function (c) { if (c.category === row.category) cat = c; });
    var head = h('div', { class: 'panel-head' },
      h('div', null,
        h('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' · watchlist' : ' · early radar') }),
        h('h2', { text: row.name }),
        h('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'one chain') + ' · records no token' })
      ),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: closeDetail })
    );
    panel.appendChild(head);
    if (m.plausibility < 1) {
      panel.appendChild(h('div', { class: 'banner' }, h('b', { text: 'Plausibility x' + m.plausibility.toFixed(2) + '. ' }), m.plausibility_reason + '.'));
    }
    var factors = h('div', { class: 'factors' });
    [
      ['TVL', fmtUsd(row.tvl_usd)], ['7-day growth', fmtPct(row.change_7d) + ' (clamped to ' + fmtPct(m.growth_pct) + ')'],
      ['Age with no token', fmtAge(m.age_days) + (m.age_days === null ? ' (uses ' + DATA.model.unknown_age_days + 'd)' : '')],
      ['Category multiple', m.category_multiple.toFixed(3) + 'x — ' + m.category_multiple_basis],
      ['Growth multiplier', 'x' + fmtMult(m.growth_multiplier)],
      ['Maturity multiplier', 'x' + fmtMult(m.maturity_multiplier)],
      ['Chain multiplier', 'x' + fmtMult(m.chain_multiplier) + ' (' + m.chain_count + ' chain' + (m.chain_count === 1 ? '' : 's') + ')'],
      ['Double-count haircut', 'x' + fmtMult(m.double_count_multiplier)],
      ['Plausibility', 'x' + fmtMult(m.plausibility)],
      ['Implied value', fmtUsd(row.implied_value_usd)],
      ['FDV range (secondary)', fmtUsd(m.fdv_low_usd) + ' – ' + fmtUsd(m.fdv_high_usd)],
      ['p25–p75 range', range],
      ['Confidence', m.confidence]
    ].forEach(function (kv) {
      factors.appendChild(h('div', null, h('span', { text: kv[0] }), h('b', { text: kv[1] })));
    });
    panel.appendChild(h('section', { class: 'psec' },
      h('h3', { text: 'Implied value — the working' }),
      factors,
      h('div', { class: 'working', text: fmtUsd(row.tvl_usd) + ' x ' + m.category_multiple.toFixed(3) + ' x ' + fmtMult(m.growth_multiplier) + ' x ' + fmtMult(m.maturity_multiplier) + ' x ' + fmtMult(m.chain_multiplier) + ' x ' + fmtMult(m.double_count_multiplier) + ' x ' + fmtMult(m.plausibility) + ' = ' + fmtUsd(row.implied_value_usd) }),
      h('p', { class: 'note', text: 'The page recomputes this row as ' + fmtUsd(check.implied) + (check.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board — the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    if (cat) {
      var compList = h('ul', { class: 'comps' });
      cat.comps.forEach(function (c) {
        compList.appendChild(h('li', null, h('span', { text: c.name }), h('b', { text: c.ratio.toFixed(3) + 'x · ' + fmtUsd(c.mcap_usd) })));
      });
      panel.appendChild(h('section', { class: 'psec' },
        h('h3', { text: 'Comparables — ' + cat.category }),
        h('p', { class: 'note', text: 'Live-token protocols in this category, mcap/TVL in (0, 3]: n=' + cat.n + ', median ' + (cat.median === null ? 'n/a' : cat.median.toFixed(3) + 'x') + ', p25 ' + (cat.p25 === null ? 'n/a' : cat.p25.toFixed(3) + 'x') + ', p75 ' + (cat.p75 === null ? 'n/a' : cat.p75.toFixed(3) + 'x') + '. Largest by TVL:' }),
        compList
      ));
    }
    var steps = h('ol', { class: 'steps' });
    row.farm_steps.forEach(function (s) {
      var p = splitStep(s);
      steps.appendChild(h('li', null, h('b', { text: p.action }), h('span', { class: 'cost', text: p.tail })));
    });
    panel.appendChild(h('section', { class: 'psec' }, h('h3', { text: 'Farm plan' }), steps));
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
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hasAttribute('hidden')) closeDetail(); });
})();
