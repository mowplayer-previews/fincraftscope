/* FinCraftScope — live markets (CoinGecko for crypto, ECB reference rates via Frankfurter for FX) + guide search */
(function () {
  var CRYPTO = 'bitcoin,ethereum,solana,ripple,cardano,binancecoin';
  var FX = ['EUR', 'GBP', 'JPY', 'MXN', 'BRL', 'CNY'];
  var FX_NAMES = { EUR: 'Euro', GBP: 'British pound', JPY: 'Japanese yen', MXN: 'Mexican peso', BRL: 'Brazilian real', CNY: 'Chinese yuan' };
  var TTL = 5 * 60 * 1000;

  function cacheGet(k) { try { var v = JSON.parse(localStorage.getItem(k)); if (v && Date.now() - v.t < TTL) return v.d; } catch (e) {} return null; }
  function cacheSet(k, d) { try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} }
  function getJSON(url, key) {
    var c = cacheGet(key); if (c) return Promise.resolve(c);
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { cacheSet(key, d); return d; });
  }
  function fmt(v, dec) { return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
  function priceTxt(v, usd) {
    var d = v >= 1000 ? 2 : v >= 1 ? 2 : 4;
    return (usd ? '$' : '') + fmt(v, d);
  }
  function spark(arr) {
    if (!arr || arr.length < 2) return '';
    var step = Math.max(1, Math.floor(arr.length / 40)), pts = [];
    for (var i = 0; i < arr.length; i += step) pts.push(arr[i]);
    if (pts[pts.length - 1] !== arr[arr.length - 1]) pts.push(arr[arr.length - 1]);
    var mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), rg = mx - mn || 1;
    return 'M' + pts.map(function (p, i) { return (i * 110 / (pts.length - 1)).toFixed(1) + ' ' + (36 - (p - mn) / rg * 32).toFixed(1); }).join(' L');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function loadCrypto() {
    return getJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + CRYPTO + '&sparkline=true&price_change_percentage=24h', 'fcs_crypto')
      .then(function (rows) {
        var order = CRYPTO.split(',');
        rows.sort(function (a, b) { return order.indexOf(a.id) - order.indexOf(b.id); });
        return rows.map(function (r) {
          var ch = r.price_change_percentage_24h || 0;
          return { sym: r.symbol.toUpperCase(), name: r.name, price: priceTxt(r.current_price, true), chg: ch, spark: spark(r.sparkline_in_7d && r.sparkline_in_7d.price) };
        });
      });
  }
  function loadFx() {
    var d = new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10);
    return getJSON('https://api.frankfurter.app/' + d + '..?from=USD&to=' + FX.join(','), 'fcs_fx')
      .then(function (res) {
        var days = Object.keys(res.rates).sort();
        return FX.map(function (c) {
          var series = days.map(function (k) { return res.rates[k][c]; }).filter(function (x) { return x != null; });
          var last = series[series.length - 1], prev = series[series.length - 2] || last;
          return { sym: 'USD/' + c, name: FX_NAMES[c], price: priceTxt(last, false), chg: (last / prev - 1) * 100, spark: spark(series) };
        });
      });
  }

  function chgHTML(q, cls) {
    var up = q.chg >= 0;
    return '<span class="' + (cls || 'chip') + ' ' + (up ? 'up' : 'down') + '">' + (up ? '▲ +' : '▼ ') + q.chg.toFixed(2) + '%</span>';
  }
  function cardHTML(q) {
    var col = q.chg >= 0 ? '#0B6B3F' : '#B3261E';
    return '<div class="qcard"><div class="r1"><div><div class="sym">' + esc(q.sym) + '</div><div class="nm">' + esc(q.name) + '</div></div>' + chgHTML(q) + '</div>' +
      '<div class="r2"><span class="px">' + esc(q.price) + '</span><svg aria-hidden="true" width="110" height="40" viewBox="0 0 110 40" fill="none"><path d="' + q.spark + '" stroke="' + col + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>';
  }
  function rowHTML(q) {
    var col = q.chg >= 0 ? '#0B6B3F' : '#B3261E', up = q.chg >= 0;
    return '<div class="mrow"><div class="l"><strong>' + esc(q.sym) + '</strong><span>' + esc(q.name) + '</span></div>' +
      '<svg aria-hidden="true" width="60" height="24" viewBox="0 0 110 40" fill="none"><path d="' + q.spark + '" stroke="' + col + '" stroke-width="3" stroke-linecap="round"/></svg>' +
      '<div class="r"><span class="px">' + esc(q.price) + '</span><span class="' + (up ? 'up' : 'down') + '">' + (up ? '▲ +' : '▼ ') + q.chg.toFixed(2) + '%</span></div></div>';
  }
  function tickHTML(q) {
    var up = q.chg >= 0;
    return '<span class="q"><strong>' + esc(q.sym) + '</strong><span>' + esc(q.price) + '</span><span class="' + (up ? 'up' : 'down') + '">' + (up ? '▲ +' : '▼ ') + q.chg.toFixed(2) + '%</span></span>';
  }
  var FAIL = '<p class="note">Market data is temporarily unavailable. Please try again later.</p>';

  var data = { crypto: loadCrypto(), fx: loadFx() };

  // Ticker
  var tick = document.getElementById('ticker-row');
  if (tick) {
    Promise.all([data.crypto.catch(function () { return []; }), data.fx.catch(function () { return []; })]).then(function (r) {
      var all = r[0].concat(r[1]);
      if (all.length) tick.innerHTML = '<span class="tag">MARKETS</span>' + all.map(tickHTML).join('');
      else tick.parentNode.style.display = 'none';
    });
  }
  // Home widget with tabs
  var grid = document.getElementById('mkt-grid');
  if (grid) {
    var btns = document.querySelectorAll('[data-mkt]');
    var show = function (k) {
      btns.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-mkt') === k ? 'true' : 'false'); });
      data[k].then(function (rows) { grid.innerHTML = rows.map(cardHTML).join(''); }).catch(function () { grid.innerHTML = FAIL; });
    };
    btns.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-mkt')); }); });
    show('crypto');
  }
  // Sidebar
  var side = document.getElementById('side-mkt');
  if (side) {
    Promise.all([data.crypto.catch(function () { return []; }), data.fx.catch(function () { return []; })]).then(function (r) {
      var rows = r[0].slice(0, 4).concat(r[1].slice(0, 2));
      side.innerHTML = rows.length ? rows.map(rowHTML).join('') : FAIL;
    });
  }

  // Guide search on /guides/
  var input = document.getElementById('guide-search');
  if (input) {
    var cards = document.querySelectorAll('[data-search]'), empty = document.getElementById('no-results');
    var q0 = new URLSearchParams(location.search).get('q'); if (q0) input.value = q0;
    var run = function () {
      var q = input.value.trim().toLowerCase(), n = 0;
      cards.forEach(function (c) { var hit = !q || c.getAttribute('data-search').indexOf(q) > -1; c.style.display = hit ? '' : 'none'; if (hit) n++; });
      empty.style.display = n ? 'none' : 'block';
    };
    input.addEventListener('input', run); run();
  }
})();
