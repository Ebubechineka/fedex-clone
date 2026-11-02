/* ==========================================================================
   FedEx clone — Create Shipment page
   --------------------------------------------------------------------------
   Generates a shipment reference, renders a Code128 barcode + QR code
   client-side, prints a 4x6in label, and shows live or demo scan events.

   WHERE TO PASTE YOUR TRACKING API KEY
   ------------------------------------
   Two places work; either is fine.

   1) Right here, in FX_SHIPMENT_CONFIG below (this page only), or
   2) In window.FX_TRACKING_CONFIG inside assets/js/fx-tracking-feature.r5.js
      (shared with the homepage Track box).

   Leave both empty and the page runs in DEMO mode: a sample scan timeline is
   shown and clearly labelled "Demo data", so the page is never broken.

   Providers supported: ship24 | aftership | 17track

   SECURITY NOTE (read before going live):
   A key placed here is visible to anyone who opens the page. That is fine for
   a review build. For production, put the key on a small server endpoint and
   set proxyUrl instead - the browser then calls your endpoint and the key
   stays private.
   ========================================================================== */

window.FX_SHIPMENT_CONFIG = {
  /* ------- EDIT BELOW THIS LINE ---------------------------------------- */
  trackingApiKey: '',   // <-- PASTE YOUR TRACKING API KEY HERE
  provider: '',         // '' = inherit from FX_TRACKING_CONFIG ('ship24' default)
  proxyUrl: '',         // '' = inherit. Your own server endpoint (recommended)
  timeoutMs: 20000
  /* ------- EDIT ABOVE THIS LINE ---------------------------------------- */
};

(function () {
  'use strict';

  var SCFG = window.FX_SHIPMENT_CONFIG || {};
  var SEQ_KEY = 'fx_shp_seq_v1';
  var LIST_KEY = 'fx_shp_shipments_v1';
  var MAX_RECENT = 6;

  /* --------------------------------------------------------------------
     Config resolution — shipment config wins, tracking config is fallback
     -------------------------------------------------------------------- */
  function cfg() {
    var t = window.FX_TRACKING_CONFIG || {};
    return {
      provider: String(SCFG.provider || t.provider || 'ship24').toLowerCase(),
      apiKey: String(SCFG.trackingApiKey || t.apiKey || '').trim(),
      proxyUrl: String(SCFG.proxyUrl || t.proxyUrl || '').trim(),
      timeoutMs: SCFG.timeoutMs || t.timeoutMs || 20000
    };
  }
  function hasKey() {
    var c = cfg();
    return !!(c.apiKey || c.proxyUrl);
  }

  /* --------------------------------------------------------------------
     Helpers
     -------------------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function val(id) { var el = $(id); return el ? String(el.value || '').trim() : ''; }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }
  function fmtMoney(n) {
    var v = Number(n);
    if (!isFinite(v)) return '';
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  /* --------------------------------------------------------------------
     Reference code:  GV-<year>-<5-digit sequence><check digit>
     e.g. GV-2026-000121  (sequence 00012, check digit 1)
     The check digit is Luhn over "<year><sequence>", so a mistyped code
     fails the check instead of silently resolving to another shipment.
     -------------------------------------------------------------------- */
  function luhnCheck(payload) {
    var sum = 0, dbl = false;
    for (var i = payload.length - 1; i >= 0; i--) {
      var d = payload.charCodeAt(i) - 48;
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      dbl = !dbl;
    }
    return (10 - (sum % 10)) % 10;
  }
  function pad5(n) {
    var s = String(n);
    while (s.length < 5) s = '0' + s;
    return s;
  }
  function makeRef(seq) {
    var year = new Date().getFullYear();
    var body = String(year) + pad5(seq);
    return 'GV-' + year + '-' + pad5(seq) + luhnCheck(body);
  }
  function refIsValid(ref) {
    var m = /^GV-(\d{4})-(\d{5})(\d)$/.exec(String(ref || '').toUpperCase());
    if (!m) return false;
    return luhnCheck(m[1] + m[2]) === Number(m[3]);
  }

  /* --------------------------------------------------------------------
     Storage (degrades to memory if localStorage is blocked)
     -------------------------------------------------------------------- */
  var mem = { seq: 0, list: [] };
  function lsGet(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ }
  }
  function nextSeq() {
    var raw = lsGet(SEQ_KEY);
    var n = parseInt(raw == null ? '0' : raw, 10);
    if (!isFinite(n) || n < 0) n = 0;
    n += 1;
    lsSet(SEQ_KEY, String(n));
    mem.seq = n;
    return n;
  }
  function readList() {
    var raw = lsGet(LIST_KEY);
    if (!raw) return mem.list.slice();
    try {
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeList(arr) {
    mem.list = arr;
    lsSet(LIST_KEY, JSON.stringify(arr));
  }
  function saveShipment(rec) {
    var arr = readList();
    arr.unshift(rec);
    if (arr.length > 40) arr = arr.slice(0, 40);
    writeList(arr);
  }
  function findShipment(ref) {
    var arr = readList();
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i].ref).toUpperCase() === String(ref).toUpperCase()) return arr[i];
    }
    return null;
  }

  /* --------------------------------------------------------------------
     Validation
     -------------------------------------------------------------------- */
  var REQUIRED = [
    ['shp-from-name', 'Enter the sender\'s name.'],
    ['shp-from-addr', 'Enter the sender\'s street address.'],
    ['shp-from-city', 'Enter the sender\'s city.'],
    ['shp-from-zip', 'Enter the sender\'s ZIP or postal code.'],
    ['shp-to-name', 'Enter the recipient\'s name.'],
    ['shp-to-addr', 'Enter the recipient\'s street address.'],
    ['shp-to-city', 'Enter the recipient\'s city.'],
    ['shp-to-zip', 'Enter the recipient\'s ZIP or postal code.']
  ];

  function setErr(id, msg) {
    var field = $(id);
    var box = $('err-' + id);
    if (field) {
      if (msg) field.classList.add('is-invalid');
      else field.classList.remove('is-invalid');
      field.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    if (box) {
      box.textContent = msg || '';
      if (msg) box.classList.add('show');
      else box.classList.remove('show');
    }
  }

  function validate() {
    var firstBad = null;
    var i;

    /* Country -> State/Region -> Postcode, in that order, so the visitor is
       never told to fix a postcode before choosing the country that decides
       which postcode format applies. */
    var addrBlocks = [
      window.FX_ADDR && window.FX_ADDR.from,
      window.FX_ADDR && window.FX_ADDR.to
    ];
    var addrNames = ['sender', 'recipient'];
    for (i = 0; i < addrBlocks.length; i++) {
      var blk = addrBlocks[i];
      if (!blk) continue;
      var which = addrNames[i];
      var cId = 'shp-' + (i === 0 ? 'from' : 'to') + '-country-value';
      if (!$(cId) || !$(cId).value) {
        setErr('shp-' + (i === 0 ? 'from' : 'to') + '-country',
               'Choose the ' + which + '\'s country.');
        if (!firstBad) firstBad = blk.country.btn;
      } else {
        setErr('shp-' + (i === 0 ? 'from' : 'to') + '-country', '');
      }
      if (!blk.validateState()) {
        if (!firstBad) firstBad = (blk.subs.length ? blk.stateSelect : blk.stateText);
      }
      if (!blk.checkPostcode(false)) {
        if (!firstBad) firstBad = blk.postcode;
      }
    }

    for (i = 0; i < REQUIRED.length; i++) {
      var id = REQUIRED[i][0];
      var msg = val(id) ? '' : REQUIRED[i][1];
      setErr(id, msg);
      if (msg && !firstBad) firstBad = $(id);
    }

    var weight = parseFloat(val('shp-weight'));
    var wMsg = '';
    if (!val('shp-weight')) wMsg = 'Enter the package weight.';
    else if (!isFinite(weight) || weight <= 0) wMsg = 'Weight must be greater than 0.';
    else if (weight > 150) wMsg = 'FedEx Express accepts up to 150 lb per package.';
    setErr('shp-weight', wMsg);
    if (wMsg && !firstBad) firstBad = $('shp-weight');

    var dims = ['shp-len', 'shp-wid', 'shp-hgt'];
    var dimLabels = { 'shp-len': 'length', 'shp-wid': 'width', 'shp-hgt': 'height' };
    for (i = 0; i < dims.length; i++) {
      var d = parseFloat(val(dims[i]));
      var dMsg = '';
      if (!val(dims[i])) dMsg = 'Enter the ' + dimLabels[dims[i]] + '.';
      else if (!isFinite(d) || d <= 0) dMsg = 'The ' + dimLabels[dims[i]] + ' must be greater than 0.';
      else if (d > 108) dMsg = 'Each side must be 108 in or less.';
      setErr(dims[i], dMsg);
      if (dMsg && !firstBad) firstBad = $(dims[i]);
    }

    var vMsg = '';
    if (val('shp-value')) {
      var v = parseFloat(val('shp-value'));
      if (!isFinite(v) || v < 0) vMsg = 'Declared value must be 0 or more.';
      else if (v > 100000) vMsg = 'Declared value above $100,000 needs a FedEx account manager.';
    }
    setErr('shp-value', vMsg);
    if (vMsg && !firstBad) firstBad = $('shp-value');

    if (firstBad) {
      firstBad.focus();
      if (firstBad.scrollIntoView) firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return false;
    }
    return true;
  }

  /* --------------------------------------------------------------------
     Codes — Code128 barcode + QR, both drawn in the browser
     -------------------------------------------------------------------- */
  function drawBarcode(canvas, text, opts) {
    if (!canvas || typeof window.JsBarcode !== 'function') return false;
    try {
      window.JsBarcode(canvas, text, Object.assign({
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        height: 70,
        width: 2,
        background: '#ffffff',
        lineColor: '#000000'
      }, opts || {}));
      return true;
    } catch (e) { return false; }
  }

  function qrSvg(text, size) {
    if (typeof window.qrcode !== 'function') return '';
    try {
      var qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) { return ''; }
  }

  /* --------------------------------------------------------------------
     Lazy code libraries
     The Code128 and QR vendors are ~122 KB between them and are only needed
     once a shipment exists. They are therefore NOT in the page's script
     tags: ensureCodeLibs() injects them on the visitor's first interaction
     with the form, so a plain page visit downloads nothing at all.
     renderCodes() paints immediately (a no-op while they are missing) and
     repaints as soon as they arrive, so the result card is never blocked.
     -------------------------------------------------------------------- */
  var VENDOR = [
    'assets/js/vendor/jsbarcode.min.js',
    'assets/js/vendor/qrcode-generator.js'
  ];
  var vendorPromise = null;
  var vendorReady = false;
  var pendingRec = null;

  function loadScript(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = resolve;   /* a failure must never block the result card */
      document.head.appendChild(s);
    });
  }

  function ensureCodeLibs() {
    if (!vendorPromise) {
      vendorPromise = Promise.all(VENDOR.map(loadScript)).then(function () {
        vendorReady = true;
        if (pendingRec) paintCodes(pendingRec);
      });
    }
    return vendorPromise;
  }

  function paintCodes(rec) {
    if (!rec) return;
    drawBarcode($('shp-bc'), rec.ref, { height: 64, width: 2 });
    var cardQr = $('shp-qr');
    if (cardQr) cardQr.innerHTML = qrSvg(rec.ref, 136);
    drawBarcode($('shp-lbl-bc'), rec.ref, { margin: 0, height: 78, width: 2 });
    var labelQr = $('shp-lbl-qr');
    if (labelQr) labelQr.innerHTML = qrSvg(rec.ref, 90);
  }

  function renderCodes(rec) {
    pendingRec = rec;
    paintCodes(rec);            /* draw now if the vendors are already in */
    if (!vendorReady) ensureCodeLibs();
  }

  /* --------------------------------------------------------------------
     Demo scan timeline — clearly labelled, deterministic per reference
     -------------------------------------------------------------------- */
  function demoScans(ref, rec) {
    var h = hash(ref);
    var now = Date.now();
    var M = 60 * 1000;
    var origin = (rec && rec.from && rec.from.city) ? rec.from.city.toUpperCase() : 'ORIGIN';
    var dest = (rec && rec.to && rec.to.city) ? rec.to.city.toUpperCase() : 'DESTINATION';

    var events = [
      { at: now - 2 * M, status: 'Shipment information sent to FedEx', place: origin },
      { at: now - 1 * M, status: 'Label created', place: origin }
    ];
    // A little variety so two different references don't look identical.
    if (h % 2 === 0) {
      events.push({ at: now - 30 * 1000, status: 'Picked up', place: origin });
    }
    return {
      number: ref,
      carrier: 'FedEx',
      service: (rec && rec.service) || 'FedEx Express',
      milestone: 'LabelCreated',
      statusText: 'Label created',
      eta: (rec && rec.eta) || '',
      events: events.map(function (e) {
        return { at: new Date(e.at).toISOString(), status: e.status, place: e.place };
      }),
      demo: true
    };
  }

  /* --------------------------------------------------------------------
     Live provider adapters (Ship24 / AfterShip / 17TRACK)
     -------------------------------------------------------------------- */
  function buildRequest(number) {
    var c = cfg();
    var p = c.provider;

    if (c.proxyUrl) {
      return {
        url: c.proxyUrl,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: number, provider: p })
        }
      };
    }
    if (p === 'aftership') {
      return {
        url: 'https://api.aftership.com/v4/trackings?tracking_numbers=' + encodeURIComponent(number),
        init: { method: 'GET', headers: { 'aftership-api-key': c.apiKey, 'Content-Type': 'application/json' } }
      };
    }
    if (p === '17track') {
      return {
        url: 'https://api.17track.net/track/v2.2/gettrackinfo',
        init: {
          method: 'POST',
          headers: { '17token': c.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify([{ number: number }])
        }
      };
    }
    return {
      url: 'https://api.ship24.com/public/v1/trackers/track',
      init: {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + c.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: number })
      }
    };
  }

  function normalise(payload, number) {
    var p = cfg().provider;
    var data = payload && payload.data;

    if (p === 'aftership') {
      var t = data && data.trackings && data.trackings[0];
      if (!t) return null;
      var cps = (t.checkpoints || []).map(function (c) {
        return {
          at: c.checkpoint_time || c.created_at,
          status: c.message || c.tag || 'Update',
          place: [c.city, c.state, c.country_name].filter(Boolean).join(', ')
        };
      });
      if (!cps.length) return null;
      return {
        number: t.tracking_number || number,
        carrier: t.slug || 'FedEx',
        service: t.title || '',
        milestone: t.tag || '',
        statusText: String(t.tag || '').replace(/_/g, ' '),
        eta: t.expected_delivery || '',
        events: cps,
        demo: false
      };
    }

    if (p === '17track') {
      var a = data && data.accepted && data.accepted[0];
      if (!a) return null;
      var prov = (a.track_info && a.track_info.tracking) || {};
      var evs = (prov.providers || []).reduce(function (acc, pr) {
        return acc.concat(pr.events || []);
      }, []);
      if (!evs.length) return null;
      evs.sort(function (x, y) { return new Date(y.time_iso || y.time_utc) - new Date(x.time_iso || x.time_utc); });
      return {
        number: a.number || number,
        carrier: 'FedEx',
        service: '',
        milestone: String(prov.status || ''),
        statusText: String(prov.status || 'In transit').replace(/_/g, ' '),
        eta: '',
        events: evs.map(function (e) {
          return {
            at: e.time_iso || e.time_utc,
            status: e.description || e.stage || 'Update',
            place: [e.location, e.country].filter(Boolean).join(', ')
          };
        }),
        demo: false
      };
    }

    // Ship24
    var tr = data && data.trackings && data.trackings[0];
    if (!tr) return null;
    var ev2 = (tr.events || []).map(function (e) {
      return {
        at: e.datetime || e.occurrenceDatetime,
        // Prefer the human-readable scan text; statusMilestone is a machine
        // enum ("InTransit") and reads badly in a timeline.
        status: e.status || e.statusMilestone || 'Update',
        place: [e.location && e.location.city, e.location && e.location.state].filter(Boolean).join(', ')
      };
    });
    if (!ev2.length) return null;
    return {
      number: (tr.tracker && tr.tracker.trackingNumber) || number,
      carrier: 'FedEx',
      service: (tr.shipment && tr.shipment.service) || '',
      milestone: (tr.events && tr.events[0] && tr.events[0].statusMilestone) || '',
      statusText: String((tr.events && tr.events[0] && tr.events[0].statusMilestone) || 'In transit').replace(/([a-z])([A-Z])/g, '$1 $2'),
      eta: (tr.shipment && tr.shipment.deliveryDate) || '',
      events: ev2,
      demo: false
    };
  }

  function fetchLive(number) {
    var req = buildRequest(number);
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, cfg().timeoutMs);
    var init = Object.assign({}, req.init);
    if (ctrl) init.signal = ctrl.signal;

    return fetch(req.url, init).then(function (res) {
      clearTimeout(timer);
      if (res.status === 401 || res.status === 403) {
        var e1 = new Error('The tracking service rejected the API key.');
        e1.kind = 'auth';
        throw e1;
      }
      if (res.status === 404) return null;
      if (res.status === 429) {
        var e2 = new Error('The tracking service is rate-limiting requests.');
        e2.kind = 'rate';
        throw e2;
      }
      if (!res.ok) {
        var e3 = new Error('The tracking service returned an error (' + res.status + ').');
        e3.kind = 'http';
        throw e3;
      }
      return res.json();
    }).then(function (payload) {
      clearTimeout(timer);
      return normalise(payload, number);
    }).catch(function (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        var e4 = new Error('The tracking service took too long to answer.');
        e4.kind = 'timeout';
        throw e4;
      }
      if (err && err.kind) throw err;
      var e5 = new Error('Could not reach the tracking service from this browser.');
      e5.kind = 'network';
      throw e5;
    });
  }

  /* --------------------------------------------------------------------
     Rendering
     -------------------------------------------------------------------- */
  var ICON_OK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10" fill="#167a3c"/><path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_WARN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10" fill="#de002e"/><path d="M12 7v6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="12" cy="16.6" r="1.2" fill="#fff"/></svg>';

  function renderScans(host, result) {
    if (!host) return;
    if (!result) { host.innerHTML = ''; return; }

    var rows = (result.events || []).map(function (e) {
      return '<li class="fx-shp__scan">' +
        '<span class="fx-shp__scan-when">' + esc(fmtDate(e.at)) + '</span>' +
        '<span class="fx-shp__scan-status">' + esc(e.status) + '</span>' +
        (e.place ? '<span class="fx-shp__scan-place">' + esc(e.place) + '</span>' : '') +
        '</li>';
    }).join('');

    host.innerHTML =
      '<div class="fx-shp__scans">' +
        '<h3>Tracking activity' + (result.demo ? ' — demo data' : '') + '</h3>' +
        '<ul class="fx-shp__scanlist">' + rows + '</ul>' +
      '</div>';
  }

  function renderResult(rec, result) {
    var section = $('shp-result');
    var card = $('shp-rescard');
    if (!section || !card) return;

    // While a live lookup is still in flight (result === null) the badge must
    // not claim "Demo data" - the key is set, so say live and let the scan
    // area report the outcome.
    var live = hasKey() && (!result || !result.demo);
    var badge = live
      ? '<span class="fx-shp__badge fx-shp__badge--live">Live tracking</span>'
      : '<span class="fx-shp__badge fx-shp__badge--demo">Demo data</span>';

    var dims = rec.dims ? (rec.dims.l + ' × ' + rec.dims.w + ' × ' + rec.dims.h + ' in') : '—';

    card.innerHTML =
      '<div class="fx-shp__reshead">' +
        '<p class="fx-shp__reseyebrow">Shipment reference</p>' +
        '<p class="fx-shp__ref" id="shp-ref-out">' + esc(rec.ref) + '</p>' +
        badge +
      '</div>' +
      '<div class="fx-shp__resgrid">' +
        '<figure class="fx-shp__codes" style="margin:0">' +
          '<div class="fx-shp__qr" id="shp-qr"></div>' +
          '<canvas class="fx-shp__bc" id="shp-bc"></canvas>' +
          '<figcaption>Scan to track</figcaption>' +
        '</figure>' +
        '<div>' +
          '<dl class="fx-shp__meta">' +
            '<div><dt>Service</dt><dd>' + esc(rec.service) + '</dd></div>' +
            '<div><dt>Weight</dt><dd>' + esc(rec.weight) + ' lb</dd></div>' +
            '<div><dt>Dimensions</dt><dd>' + esc(dims) + '</dd></div>' +
            '<div><dt>Declared value</dt><dd>' + esc(rec.value ? fmtMoney(rec.value) : '—') + '</dd></div>' +
            '<div><dt>From</dt><dd>' + esc(rec.from.name) + '<br>' + esc(rec.from.city) + '</dd></div>' +
            '<div><dt>To</dt><dd>' + esc(rec.to.name) + '<br>' + esc(rec.to.city) + '</dd></div>' +
            '<div><dt>Created</dt><dd>' + esc(fmtDate(rec.createdAt)) + '</dd></div>' +
          '</dl>' +
          '<div id="shp-scans"></div>' +
        '</div>' +
      '</div>' +
      '<div class="fx-shp__resactions">' +
        '<button type="button" class="fx-shp__btn" id="shp-print">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
            '<path d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-6a1 1 0 011-1h16a1 1 0 011 1v6a1 1 0 01-1 1h-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<rect x="6" y="14" width="12" height="7" stroke="currentColor" stroke-width="2"/>' +
          '</svg>Print label</button>' +
        '<a class="fx-shp__btn fx-shp__btn--ghost" id="shp-track-link" href="index.html?trackingNumber=' +
          encodeURIComponent(rec.ref) + '">Track this shipment</a>' +
        '<button type="button" class="fx-shp__btn fx-shp__btn--ghost" id="shp-new">Create another</button>' +
      '</div>';

    section.hidden = false;

    renderScans($('shp-scans'), result);

    /* Label */
    buildLabel(rec);

    /* Codes — Code128 + QR, painted on demand (see renderCodes). */
    renderCodes(rec);

    // Wire the buttons that were just created
    var printBtn = $('shp-print');
    if (printBtn) printBtn.addEventListener('click', printLabel);
    var newBtn = $('shp-new');
    if (newBtn) newBtn.addEventListener('click', function () {
      section.hidden = true;
      var form = $('shp-form');
      if (form) form.reset();
      var first = $('shp-from-name');
      if (first) first.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    section.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /* --------------------------------------------------------------------
     Printable 4x6in label
     -------------------------------------------------------------------- */
  function buildLabel(rec) {
    var host = $('shp-label');
    if (!host) return;
    var dims = rec.dims ? (rec.dims.l + ' × ' + rec.dims.w + ' × ' + rec.dims.h + ' in') : '—';

    host.innerHTML =
      '<div class="fx-shp__lbl-top">' +
        '<div class="fx-shp__lbl-brand"><em>Fed</em><b>Ex</b></div>' +
        '<div class="fx-shp__lbl-svc">' + esc(rec.service) +
          '<span>Tracking # ' + esc(rec.ref) + '</span></div>' +
      '</div>' +
      '<div class="fx-shp__lbl-bc"><canvas id="shp-lbl-bc"></canvas></div>' +
      '<p class="fx-shp__lbl-ref">' + esc(rec.ref) + '</p>' +
      '<div class="fx-shp__lbl-cols">' +
        '<div class="fx-shp__lbl-col">' +
          '<h4>Ship from</h4>' +
          '<p><strong>' + esc(rec.from.name) + '</strong></p>' +
          '<p>' + esc(rec.from.addr) + '</p>' +
          '<p>' + esc([rec.from.city, rec.from.state, rec.from.zip].filter(Boolean).join(', ')) + '</p>' +
          (rec.from.phone ? '<p>' + esc(rec.from.phone) + '</p>' : '') +
        '</div>' +
        '<div class="fx-shp__lbl-col">' +
          '<h4>Ship to</h4>' +
          '<p><strong>' + esc(rec.to.name) + '</strong></p>' +
          '<p>' + esc(rec.to.addr) + '</p>' +
          '<p>' + esc([rec.to.city, rec.to.state, rec.to.zip].filter(Boolean).join(', ')) + '</p>' +
          (rec.to.phone ? '<p>' + esc(rec.to.phone) + '</p>' : '') +
        '</div>' +
        '<div class="fx-shp__lbl-qr" id="shp-lbl-qr"></div>' +
      '</div>' +
      '<div class="fx-shp__lbl-foot">' +
        '<span>WT ' + esc(rec.weight) + ' LB &nbsp;·&nbsp; ' + esc(dims) + '</span>' +
        '<span>Declared ' + esc(rec.value ? fmtMoney(rec.value) : '—') + '</span>' +
      '</div>';

  }

  function printLabel() {
    document.body.classList.add('fx-shp-printing');
    var done = function () {
      document.body.classList.remove('fx-shp-printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  }

  /* --------------------------------------------------------------------
     Recent shipments panel
     -------------------------------------------------------------------- */
  function renderRecent() {
    var host = $('shp-recent');
    if (!host) return;
    var arr = readList().slice(0, MAX_RECENT);
    if (!arr.length) {
      host.innerHTML = '<p class="fx-shp__empty">No shipments yet. The first one you create appears here.</p>';
      return;
    }
    host.innerHTML = '<ul class="fx-shp__recent">' + arr.map(function (r) {
      return '<li><a href="index.html?trackingNumber=' + encodeURIComponent(r.ref) + '">' +
        '<code>' + esc(r.ref) + '</code></a>' +
        '<span>' + esc(r.to && r.to.city ? r.to.city : '') + '</span></li>';
    }).join('') + '</ul>';
  }

  function renderMode() {
    var host = $('shp-mode');
    if (!host) return;
    if (hasKey()) {
      host.className = 'fx-shp__mode fx-shp__mode--live';
      host.textContent = 'Live tracking';
    } else {
      host.className = 'fx-shp__mode fx-shp__mode--demo';
      host.textContent = 'Demo mode';
    }
  }

  /* --------------------------------------------------------------------
     Submit
     -------------------------------------------------------------------- */
  /* Address blocks registered by the cascade in fx-address.r1.js. */
  function addrOf(which) {
    var blocks = window.FX_ADDR || {};
    var b = blocks[which];
    if (!b) return { state: '', stateName: '', country: '', countryName: '' };
    return b.values();
  }

  function collect() {
    var service = val('shp-service') || 'FedEx Express';
    var weight = parseFloat(val('shp-weight'));
    var value = val('shp-value') ? parseFloat(val('shp-value')) : 0;
    return {
      ref: '',
      service: service,
      weight: String(weight),
      dims: {
        l: String(parseFloat(val('shp-len'))),
        w: String(parseFloat(val('shp-wid'))),
        h: String(parseFloat(val('shp-hgt')))
      },
      value: value,
      from: {
        name: val('shp-from-name'),
        addr: val('shp-from-addr'),
        city: val('shp-from-city'),
        state: addrOf('from').state,
        stateName: addrOf('from').stateName,
        country: addrOf('from').country,
        countryName: addrOf('from').countryName,
        zip: val('shp-from-zip'),
        phone: val('shp-from-phone')
      },
      to: {
        name: val('shp-to-name'),
        addr: val('shp-to-addr'),
        city: val('shp-to-city'),
        state: addrOf('to').state,
        stateName: addrOf('to').stateName,
        country: addrOf('to').country,
        countryName: addrOf('to').countryName,
        zip: val('shp-to-zip'),
        phone: val('shp-to-phone')
      },
      createdAt: new Date().toISOString()
    };
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;

    var btn = $('shp-submit');
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }

    var rec = collect();
    rec.ref = makeRef(nextSeq());
    saveShipment(rec);
    renderRecent();

    if (!hasKey()) {
      renderResult(rec, demoScans(rec.ref, rec));
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
      return;
    }

    // Live mode: show the card immediately, then fill in real scans.
    // The scan host only exists once renderResult() has built the card, so it
    // must be looked up AFTER that call - not before.
    renderResult(rec, null);
    var scansHost = $('shp-scans');
    if (scansHost) {
      scansHost.innerHTML = '<div class="fx-shp__scans"><h3>Tracking activity</h3>' +
        '<p class="fx-shp__hint"><span class="fx-shp__spinner"></span>Looking up live scans…</p></div>';
    }

    fetchLive(rec.ref).then(function (result) {
      if (!result) {
        if (scansHost) {
          scansHost.innerHTML = '<div class="fx-shp__state">' + ICON_WARN +
            '<div><strong>No scans yet</strong>FedEx has not scanned this label yet. ' +
            'It can take a few hours after drop-off.</div></div>';
        }
        return;
      }
      renderScans(scansHost, result);
    }).catch(function (err) {
      if (scansHost) {
        scansHost.innerHTML = '<div class="fx-shp__state">' + ICON_WARN +
          '<div><strong>Live tracking unavailable</strong>' + esc(err.message) +
          ' The reference above is still valid.</div></div>';
      }
    }).then(function () {
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
    });
  }

  /* --------------------------------------------------------------------
     Boot
     -------------------------------------------------------------------- */
  function boot() {
    renderMode();
    renderRecent();

    var form = $('shp-form');
    if (form) form.addEventListener('submit', onSubmit);

    /* Fetch the barcode/QR libraries on the visitor's first interaction with
       the form, so they are usually already cached by the time Create is
       pressed. Nothing is fetched if the visitor never touches the form. */
    if (form) {
      var warm = function () { ensureCodeLibs(); };
      form.addEventListener('focusin', warm, { once: true });
      form.addEventListener('input', warm, { once: true });
    }

    // Clear a field's error as soon as the visitor fixes it.
    var fields = form ? form.querySelectorAll('input, select') : [];
    for (var i = 0; i < fields.length; i++) {
      (function (el) {
        el.addEventListener('input', function () {
          if (el.classList.contains('is-invalid')) setErr(el.id, '');
        });
        el.addEventListener('change', function () {
          if (el.classList.contains('is-invalid')) setErr(el.id, '');
        });
      })(fields[i]);
    }

    // Deep link: create-shipment.html?ref=GV-2026-000121 reopens a shipment.
    var ref = new URLSearchParams(location.search).get('ref');
    if (ref) {
      var rec = findShipment(ref);
      if (rec) renderResult(rec, demoScans(rec.ref, rec));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
