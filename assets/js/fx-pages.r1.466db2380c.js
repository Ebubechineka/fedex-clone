/* ==========================================================================
   fx-pages.r1.js — behaviour for the FedEx clone's secondary pages
   --------------------------------------------------------------------------
   One file, no dependencies, no external requests. Each block boots only if
   its page is present, so the same file can be loaded everywhere.

   Blocks:
     0. showNotice()  — in-page notice for links that have no local page
                        (external FedEx systems, legal PDFs, social profiles)
     1. FAQ accordion (support.html)
     2. Tabs (signup-login.html)
     3. Form validation helper (shared)
     4. Tracking (tracking.html) — demo timeline + live provider hook
     5. Rates calculator (rates.html)
     6. Locations search + filters (locations.html)
     7. Pickup scheduler (pickup.html)
     8. Sign up / log in (signup-login.html)
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || doc).querySelectorAll(sel)); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  function money(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  /* ------------------------------------------------------------------
     0. In-page notice for links with no local destination
     ------------------------------------------------------------------ */
  var NOTICE_COPY = {
    external: {
      title: 'This link leaves the review build',
      body: 'This destination lives outside the static clone, so it is not reproduced here. Nothing leaves this build \u2014 use the navigation above to keep exploring.'
    },
    legal: {
      title: 'Legal document',
      body: 'This policy is not part of this demonstration build.'
    },
    social: {
      title: 'Social profile',
      body: 'Social profiles are not reproduced in this static demonstration build. Nothing leaves this site.'
    },
    tel: {
      title: 'Call FedEx',
      body: 'This would start a phone call on a device with telephony. Copy the number above to dial it yourself.'
    },
    demo: {
      title: 'Not part of this build',
      body: 'This control is a stand-in in the demonstration build and has no destination of its own. Every page of the clone is reachable from the navigation above.'
    }
  };

  function ensureNotice() {
    var el = doc.getElementById('fx-notice');
    if (el) return el;
    el = doc.createElement('div');
    el.id = 'fx-notice';
    el.className = 'fx-notice';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'fx-notice-title');
    el.innerHTML =
      '<div class="fx-notice__box">' +
        '<h2 class="fx-notice__title" id="fx-notice-title"></h2>' +
        '<p class="fx-notice__body" id="fx-notice-body"></p>' +
        '<div class="fx-notice__actions">' +
          '<button type="button" class="fx-notice__btn" data-fx-notice-close>Close</button>' +
        '</div>' +
      '</div>';
    doc.body.appendChild(el);

    el.addEventListener('click', function (ev) {
      if (ev.target === el || ev.target.closest('[data-fx-notice-close]')) hideNotice();
    });
    doc.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !el.hidden) hideNotice();
    });
    return el;
  }

  var lastFocus = null;
  function hideNotice() {
    var el = doc.getElementById('fx-notice');
    if (!el) return;
    el.hidden = true;
    doc.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function showNotice(kind, label) {
    var el = ensureNotice();
    var copy = NOTICE_COPY[kind] || NOTICE_COPY.external;
    lastFocus = doc.activeElement;
    $('#fx-notice-title', el).textContent = label ? label + ' \u2014 ' + copy.title : copy.title;
    /* Nothing in this dialog navigates: the copy carries no URL and there is
       no "open externally" control. This build never leaves its own domain. */
    $('#fx-notice-body', el).textContent = copy.body;
    el.hidden = false;
    doc.body.style.overflow = 'hidden';
    var btn = $('[data-fx-notice-close]', el);
    if (btn) btn.focus();
  }
  window.showNotice = showNotice;

  /* Any element carrying data-fx-notice="kind" opens the notice instead of
     navigating. Used for the few destinations that genuinely have no local
     page. Nothing here ever holds or reveals an external URL. */
  function wireNotices() {
    function handle(ev) {
      var a = ev.target.closest && ev.target.closest('[data-fx-notice]');
      if (!a) return;
      ev.preventDefault();
      var label = (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim();
      showNotice(a.getAttribute('data-fx-notice'), label);
    }
    doc.addEventListener('click', handle);
    /* The social/non-navigating elements are role="link" tabindex="0", so a
       keyboard user needs Enter and Space to fire them too. */
    doc.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var a = ev.target.closest && ev.target.closest('[data-fx-notice]');
      if (!a) return;
      ev.preventDefault();
      handle(ev);
    });
  }

  /* ------------------------------------------------------------------
     1. FAQ accordion
     ------------------------------------------------------------------ */
  function wireFaq() {
    var items = $$('.fxp__faq-q');
    if (!items.length) return;
    items.forEach(function (btn) {
      var panel = doc.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        panel.hidden = open;
      });
    });
  }

  /* ------------------------------------------------------------------
     2. Tabs
     ------------------------------------------------------------------ */
  function wireTabs() {
    var tabs = $$('.fxp__tab');
    if (!tabs.length) return;
    function select(tab) {
      tabs.forEach(function (t) {
        var on_ = t === tab;
        t.setAttribute('aria-selected', on_ ? 'true' : 'false');
        t.setAttribute('tabindex', on_ ? '0' : '-1');
        var p = doc.getElementById(t.getAttribute('aria-controls'));
        if (p) p.hidden = !on_;
      });
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (ev) {
        var i = tabs.indexOf(t);
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
          ev.preventDefault();
          var next = tabs[(i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
          select(next);
          next.focus();
        }
      });
    });
  }

  /* ------------------------------------------------------------------
     3. Validation helper
     ------------------------------------------------------------------ */
  function setErr(input, msg) {
    var id = input.getAttribute('aria-describedby');
    var box = id ? doc.getElementById(id) : null;
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      if (box) box.textContent = msg;
    } else {
      input.removeAttribute('aria-invalid');
      if (box) box.textContent = '';
    }
    return !msg;
  }

  function validateField(input) {
    var v = (input.value || '').trim();
    var type = input.getAttribute('data-fx-validate') || input.type;
    var label = input.getAttribute('data-fx-label') || 'This field';

    if (input.required && !v) return setErr(input, label + ' is required.');

    if (type === 'email' && v) {
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) return setErr(input, 'Enter a valid email address, e.g. name@example.com.');
    }
    if (type === 'tel' && v) {
      var digits = v.replace(/\D/g, '');
      if (digits.length < 10) return setErr(input, 'Enter a phone number with at least 10 digits.');
    }
    if (type === 'zip' && v) {
      if (!/^\d{5}(-\d{4})?$/.test(v)) return setErr(input, 'Enter a 5-digit ZIP code.');
    }
    if (type === 'password' && v) {
      if (v.length < 8) return setErr(input, 'Use at least 8 characters.');
    }
    if (input.getAttribute('data-fx-min') && v) {
      var min = parseFloat(input.getAttribute('data-fx-min'));
      if (parseFloat(v) < min) return setErr(input, 'Enter a value of ' + min + ' or more.');
    }
    if (input.getAttribute('data-fx-max') && v) {
      var max = parseFloat(input.getAttribute('data-fx-max'));
      if (parseFloat(v) > max) return setErr(input, 'Enter a value of ' + max + ' or less.');
    }
    return setErr(input, '');
  }

  function wireValidation(form) {
    var fields = $$('input, select, textarea', form).filter(function (f) {
      return f.type !== 'hidden' && f.type !== 'submit' && f.type !== 'button';
    });
    fields.forEach(function (f) {
      f.addEventListener('blur', function () { validateField(f); });
      f.addEventListener('input', function () {
        if (f.getAttribute('aria-invalid') === 'true') validateField(f);
      });
    });
    return function validateAll() {
      var ok = true;
      var first = null;
      fields.forEach(function (f) {
        if (!validateField(f)) {
          ok = false;
          if (!first) first = f;
        }
      });
      if (first) first.focus();
      return ok;
    };
  }

  /* ------------------------------------------------------------------
     4. Tracking
     ------------------------------------------------------------------ */
  var HUBS = ['SAN JOSE, CA', 'OAKLAND, CA', 'MEMPHIS, TN', 'INDIANAPOLIS, IN',
              'NEWARK, NJ', 'LOS ANGELES, CA', 'DALLAS, TX', 'ATLANTA, GA'];
  var DESTS = ['SEATTLE, WA', 'AUSTIN, TX', 'BOSTON, MA', 'DENVER, CO',
               'NASHVILLE, TN', 'PHOENIX, AZ', 'CHICAGO, IL', 'MIAMI, FL'];

  function demoScans(number) {
    var h = hash(number);
    var hub = HUBS[h % HUBS.length];
    var hub2 = HUBS[(h >> 3) % HUBS.length];
    var dest = DESTS[(h >> 5) % DESTS.length];
    var now = Date.now();
    var step = 3600 * 1000 * 7;
    var raw = [
      { status: 'Picked up', place: hub, offset: 4 },
      { status: 'In transit', place: hub, offset: 3 },
      { status: 'Departed FedEx location', place: hub, offset: 2 },
      { status: 'Arrived at FedEx location', place: hub2, offset: 1 },
      { status: 'On FedEx vehicle for delivery', place: dest, offset: 0 }
    ];
    return raw.map(function (r, i) {
      return {
        when: new Date(now - r.offset * step).toISOString(),
        status: r.status,
        place: r.place,
        current: i === 0
      };
    });
  }

  function renderTracking(host, data) {
    var scans = data.scans.slice().sort(function (a, b) {
      return new Date(b.when) - new Date(a.when);
    });
    var rows = scans.map(function (s, i) {
      var cls = 'fxp__scan' + (i === 0 ? ' fxp__scan--current' : ' fxp__scan--done');
      return '<li class="' + cls + '">' +
        '<span class="fxp__scan-when">' + esc(fmtDate(s.when)) + '</span>' +
        '<span class="fxp__scan-status">' + esc(s.status) + '</span>' +
        '<span class="fxp__scan-place">' + esc(s.place) + '</span>' +
      '</li>';
    }).join('');

    var badgeCls = data.statusKind === 'delivered' ? 'fxp__badge--ok'
                 : data.statusKind === 'exception' ? 'fxp__badge--err'
                 : 'fxp__badge--transit';

    host.innerHTML =
      '<div class="fxp__card fxp__card--flat">' +
        '<div class="fxp__reshead">' +
          '<div><span class="fxp__ref">' + esc(data.number) + '</span></div>' +
          '<div>' +
            '<span class="fxp__badge ' + badgeCls + '">' + esc(data.status) + '</span> ' +
            (data.demo ? '<span class="fxp__badge fxp__badge--demo">Demo data</span>' : '') +
          '</div>' +
        '</div>' +
        '<dl class="fxp__meta">' +
          '<div><dt>Service</dt><dd>' + esc(data.service) + '</dd></div>' +
          '<div><dt>Ship date</dt><dd>' + esc(data.shipDate) + '</dd></div>' +
          '<div><dt>Estimated delivery</dt><dd>' + esc(data.eta) + '</dd></div>' +
          '<div><dt>Scans</dt><dd>' + scans.length + '</dd></div>' +
        '</dl>' +
        '<h3 class="fxp__h3">Tracking history</h3>' +
        '<ol class="fxp__timeline">' + rows + '</ol>' +
        (data.demo
          ? '<p class="fxp__hint">Sample timeline generated in the browser. Add a tracking API key in ' +
            '<code>FX_TRACKING_CONFIG</code> to show live scans.</p>'
          : '') +
      '</div>';
  }

  function wireTracking() {
    var form = doc.getElementById('trk-form');
    if (!form) return;
    var input = doc.getElementById('trk-number');
    var host = doc.getElementById('trk-result');
    var btn = doc.getElementById('trk-submit');
    var validate = wireValidation(form);

    // Prefill from ?trackingNumber= (the Create Shipment page links here)
    var qs = new URLSearchParams(location.search);
    var pre = qs.get('trackingNumber') || qs.get('trk') || '';
    if (pre) input.value = pre;

    function run(number) {
      host.innerHTML = '';
      var card = doc.createElement('div');
      card.className = 'fxp__card fxp__card--flat';
      card.innerHTML = '<p class="fxp__muted"><span class="fxp__spinner fxp__spinner--dark"></span> Looking up ' +
        esc(number) + '\u2026</p>';
      host.appendChild(card);
      btn.disabled = true;

      setTimeout(function () {
        btn.disabled = false;
        // A number that is too short or all zeros is treated as unknown, so the
        // not-found state is reachable in the demo.
        if (/^0+$/.test(number) || number.length < 8) {
          host.innerHTML =
            '<div class="fxp__card fxp__card--flat">' +
              '<div class="fxp__alert fxp__alert--err"><div><strong>No shipment found for ' +
              esc(number) + '.</strong><br>Check the number and try again. Tracking numbers are ' +
              'usually 12 to 22 characters.</div></div>' +
            '</div>';
          return;
        }
        var h = hash(number);
        renderTracking(host, {
          number: number,
          status: 'In transit',
          statusKind: 'transit',
          service: h % 3 === 0 ? 'FedEx Ground\u00ae' : 'FedEx Express\u00ae',
          shipDate: fmtDate(new Date(Date.now() - 4 * 864e5).toISOString()).split(',')[0],
          eta: fmtDate(new Date(Date.now() + 2 * 864e5).toISOString()).split(',')[0],
          scans: demoScans(number),
          demo: true
        });
      }, 550);
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!validate()) return;
      run(input.value.trim().replace(/\s+/g, ''));
    });

    if (pre) run(pre.trim().replace(/\s+/g, ''));
  }

  /* ------------------------------------------------------------------
     5. Rates calculator
     ------------------------------------------------------------------ */
  var SERVICES = [
    { id: 'priority', name: 'FedEx Priority Overnight\u00ae', desc: 'Next-business-day delivery by 10:30 a.m.', base: 24.5, perLb: 3.1, days: 1 },
    { id: 'standard', name: 'FedEx Standard Overnight\u00ae', desc: 'Next-business-day delivery by 8 p.m.', base: 18.9, perLb: 2.4, days: 1 },
    { id: 'express2', name: 'FedEx 2Day\u00ae', desc: 'Second-business-day delivery by 4:30 p.m.', base: 14.2, perLb: 1.9, days: 2 },
    { id: 'express', name: 'FedEx Express Saver\u00ae', desc: 'Third-business-day delivery by 4:30 p.m.', base: 11.4, perLb: 1.5, days: 3 },
    { id: 'ground', name: 'FedEx Ground\u00ae', desc: 'Business-day delivery in 1\u20135 days', base: 8.6, perLb: 0.95, days: 4 },
    { id: 'home', name: 'FedEx Home Delivery\u00ae', desc: 'Residential delivery in 1\u20135 business days', base: 9.1, perLb: 1.05, days: 4 }
  ];

  function wireRates() {
    var form = doc.getElementById('rate-form');
    if (!form) return;
    var host = doc.getElementById('rate-result');
    var validate = wireValidation(form);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!validate()) return;

      var weight = parseFloat($('#rate-weight').value) || 1;
      var l = parseFloat($('#rate-len').value) || 0;
      var w = parseFloat($('#rate-wid').value) || 0;
      var h = parseFloat($('#rate-hgt').value) || 0;
      var fromZip = $('#rate-from-zip').value.trim();
      var toZip = $('#rate-to-zip').value.trim();
      var intl = $('#rate-intl').value === 'yes';

      // Billable weight = greater of actual and dimensional (L*W*H/139)
      var dim = l && w && h ? (l * w * h) / 139 : 0;
      var billable = Math.max(weight, dim);
      var zone = Math.abs(parseInt(fromZip.slice(0, 3), 10) - parseInt(toZip.slice(0, 3), 10));
      var zoneFactor = 1 + Math.min(zone, 40) / 55;

      var rows = SERVICES.map(function (s) {
        var price = (s.base + s.perLb * billable) * zoneFactor;
        if (intl) price *= 2.35;
        if (s.id === 'priority' || s.id === 'standard') price *= 1.12;
        return { s: s, price: Math.round(price * 100) / 100 };
      }).sort(function (a, b) { return a.price - b.price; });

      var cheapest = rows[0];
      var fastest = rows.slice().sort(function (a, b) { return a.s.days - b.s.days || a.price - b.price; })[0];

      var html = rows.map(function (r) {
        var best = r === cheapest;
        var eta = new Date(Date.now() + r.s.days * 864e5);
        return '<div class="fxp__svc' + (best ? ' fxp__svc--best' : '') + '">' +
          '<div>' +
            '<div class="fxp__svc-name">' + esc(r.s.name) +
              (best ? ' <span class="fxp__badge fxp__badge--ok">Best value</span>' : '') +
              (r === fastest && !best ? ' <span class="fxp__badge fxp__badge--transit">Fastest</span>' : '') +
            '</div>' +
            '<div class="fxp__svc-desc">' + esc(r.s.desc) + '</div>' +
          '</div>' +
          '<div>' +
            '<div class="fxp__svc-price">' + money(r.price) + '</div>' +
            '<div class="fxp__svc-eta">Est. ' + eta.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      host.innerHTML =
        '<div class="fxp__card fxp__card--flat">' +
          '<div class="fxp__reshead">' +
            '<div><span class="fxp__ref">' + esc(fromZip) + ' \u2192 ' + esc(toZip) + '</span></div>' +
            '<div><span class="fxp__badge fxp__badge--demo">Estimated rates</span></div>' +
          '</div>' +
          '<dl class="fxp__meta">' +
            '<div><dt>Actual weight</dt><dd>' + weight.toFixed(1) + ' lb</dd></div>' +
            '<div><dt>Dimensional weight</dt><dd>' + (dim ? dim.toFixed(1) + ' lb' : '\u2014') + '</dd></div>' +
            '<div><dt>Billable weight</dt><dd>' + billable.toFixed(1) + ' lb</dd></div>' +
            '<div><dt>Service</dt><dd>' + (intl ? 'International' : 'Domestic') + '</dd></div>' +
          '</dl>' +
          '<h3 class="fxp__h3">' + rows.length + ' service options</h3>' +
          html +
          '<p class="fxp__hint">Rates are calculated in the browser from a published rate table for ' +
          'demonstration. Live account rates come from the FedEx Rating API.</p>' +
          '<div class="fxp__actions">' +
            '<a class="fxp__btn" href="create-shipment.html">Create a shipment</a>' +
            '<a class="fxp__btn fxp__btn--ghost" href="pickup.html">Schedule a pickup</a>' +
          '</div>' +
        '</div>';
      host.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  /* ------------------------------------------------------------------
     6. Locations
     ------------------------------------------------------------------ */
  var LOCATIONS = [
    { name: 'FedEx Office Print & Ship Center', addr: '1201 Market St, San Francisco, CA 94103', city: 'San Francisco', tags: ['Drop off', 'Print', 'Packaging'], dist: 0.4, hours: 'Mon\u2013Fri 7am\u20139pm' },
    { name: 'FedEx Ship Center', addr: '450 Bryant St, San Francisco, CA 94107', city: 'San Francisco', tags: ['Drop off', 'Hold at location'], dist: 1.1, hours: 'Mon\u2013Fri 8am\u20136pm' },
    { name: 'FedEx Authorized ShipCenter', addr: '2130 Fillmore St, San Francisco, CA 94115', city: 'San Francisco', tags: ['Drop off'], dist: 2.3, hours: 'Mon\u2013Sat 9am\u20137pm' },
    { name: 'FedEx Office Print & Ship Center', addr: '1801 Broadway, Oakland, CA 94612', city: 'Oakland', tags: ['Drop off', 'Print'], dist: 8.6, hours: 'Mon\u2013Fri 7am\u20138pm' },
    { name: 'FedEx Ship Center', addr: '800 Embarcadero, Oakland, CA 94606', city: 'Oakland', tags: ['Drop off', 'Hold at location', 'Packaging'], dist: 9.4, hours: 'Mon\u2013Fri 8am\u20137pm' },
    { name: 'FedEx Drop Box', addr: '500 El Camino Real, Palo Alto, CA 94301', city: 'Palo Alto', tags: ['Drop off'], dist: 14.2, hours: '24 hours' },
    { name: 'FedEx Office Print & Ship Center', addr: '301 University Ave, Palo Alto, CA 94301', city: 'Palo Alto', tags: ['Drop off', 'Print', 'Packaging'], dist: 14.8, hours: 'Mon\u2013Fri 7am\u20139pm' },
    { name: 'FedEx Ship Center', addr: '1500 Old Bayshore Hwy, San Jose, CA 95112', city: 'San Jose', tags: ['Drop off', 'Hold at location'], dist: 28.5, hours: 'Mon\u2013Fri 8am\u20136pm' },
    { name: 'FedEx Authorized ShipCenter', addr: '88 S 3rd St, San Jose, CA 95113', city: 'San Jose', tags: ['Drop off', 'Packaging'], dist: 29.1, hours: 'Mon\u2013Sat 9am\u20136pm' },
    { name: 'FedEx Drop Box', addr: '1 Main St, Napa, CA 94559', city: 'Napa', tags: ['Drop off'], dist: 41.0, hours: '24 hours' }
  ];

  function wireLocations() {
    var list = doc.getElementById('loc-list');
    if (!list) return;
    var search = doc.getElementById('loc-search');
    var count = doc.getElementById('loc-count');
    var mapNote = doc.getElementById('loc-map-note');
    var active = 'all';

    function render() {
      var q = (search.value || '').trim().toLowerCase();
      var rows = LOCATIONS.filter(function (l) {
        if (active !== 'all' && l.tags.indexOf(active) === -1) return false;
        if (!q) return true;
        return (l.name + ' ' + l.addr + ' ' + l.city + ' ' + l.tags.join(' ')).toLowerCase().indexOf(q) !== -1;
      }).sort(function (a, b) { return a.dist - b.dist; });

      count.textContent = rows.length + (rows.length === 1 ? ' location' : ' locations') +
        (q ? ' matching \u201c' + q + '\u201d' : '') + (active !== 'all' ? ' with ' + active : '');

      if (!rows.length) {
        list.innerHTML = '<div class="fxp__empty">No locations match that search. Try a city, a ZIP code, ' +
          'or clear the filters.</div>';
        mapNote.textContent = 'No results to plot.';
        return;
      }

      list.innerHTML = rows.map(function (l) {
        return '<div class="fxp__loc">' +
          '<div>' +
            '<div class="fxp__loc-name">' + esc(l.name) + '</div>' +
            '<div class="fxp__loc-addr">' + esc(l.addr) + '<br>' + esc(l.hours) + '</div>' +
            '<div class="fxp__loc-tags">' + l.tags.map(function (t) {
              return '<span class="fxp__tag">' + esc(t) + '</span>';
            }).join('') + '</div>' +
          '</div>' +
          '<div class="fxp__loc-dist">' + l.dist.toFixed(1) + ' mi</div>' +
        '</div>';
      }).join('');

      mapNote.textContent = rows.length + ' of ' + LOCATIONS.length + ' locations plotted. ' +
        'Nearest: ' + rows[0].name + ', ' + rows[0].dist.toFixed(1) + ' mi.';
    }

    on(search, 'input', render);
    $$('.fxp__chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        active = chip.getAttribute('data-filter');
        $$('.fxp__chip').forEach(function (c) {
          c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
        });
        render();
      });
    });
    render();
  }

  /* ------------------------------------------------------------------
     7. Pickup
     ------------------------------------------------------------------ */
  function wirePickup() {
    var form = doc.getElementById('pickup-form');
    if (!form) return;
    var validate = wireValidation(form);

    /* Country -> State -> Postcode. The cascade owns these three fields; the
       generic wireValidation() above only knows about the other inputs. */
    function validateAddress() {
      var blk = window.FX_ADDR && window.FX_ADDR.pickup;
      if (!blk) return true;
      var ok = true;
      var first = null;
      var cVal = doc.getElementById('pk-country-value');
      if (!cVal || !cVal.value) {
        var cBox = doc.getElementById('err-pk-country');
        if (cBox) { cBox.textContent = 'Choose the pickup country.'; cBox.classList.add('show'); }
        ok = false; first = first || blk.country.btn;
      } else {
        var cBox2 = doc.getElementById('err-pk-country');
        if (cBox2) { cBox2.textContent = ''; cBox2.classList.remove('show'); }
      }
      if (!blk.validateState()) { ok = false; first = first || (blk.subs.length ? blk.stateSelect : blk.stateText); }
      if (!blk.checkPostcode(false)) { ok = false; first = first || blk.postcode; }
      if (first && first.focus) first.focus();
      return ok;
    }

    function pickupAddress() {
      var blk = window.FX_ADDR && window.FX_ADDR.pickup;
      var v = blk ? blk.values() : { stateName: '', countryName: '', postcode: '' };
      var parts = [
        $('#pk-addr') ? $('#pk-addr').value : '',
        $('#pk-city') ? $('#pk-city').value : '',
        v.stateName || '',
        v.postcode || ''
      ].filter(Boolean);
      return {
        postcode: v.postcode || '',
        line: parts.join(', ') + (v.countryName ? ', ' + v.countryName : '')
      };
    }
    var host = doc.getElementById('pickup-result');
    var dateEl = doc.getElementById('pk-date');
    var timeEl = doc.getElementById('pk-time');

    // Earliest pickup is tomorrow; block past dates in the picker itself.
    var tomorrow = new Date(Date.now() + 864e5);
    var iso = tomorrow.toISOString().slice(0, 10);
    if (dateEl) { dateEl.min = iso; dateEl.value = iso; }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!validateAddress(form)) return;
      if (!validate()) return;

      var d = dateEl.value;
      var t = timeEl.value;
      var when = new Date(d + 'T' + (t || '09:00'));
      var addr = pickupAddress();
      var ref = 'PU-' + String(hash(d + t + addr.postcode) % 900000 + 100000);

      host.innerHTML =
        '<div class="fxp__card fxp__card--flat">' +
          '<div class="fxp__alert fxp__alert--ok"><div><strong>Pickup scheduled.</strong><br>' +
            'A courier is booked for ' + esc(when.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })) +
            ' between ' + esc(t || '09:00') + ' and ' + esc(addHours(t || '09:00', 2)) + '.</div></div>' +
          '<dl class="fxp__meta fxp__mt">' +
            '<div><dt>Confirmation</dt><dd>' + esc(ref) + '</dd></div>' +
            '<div><dt>Pickup window</dt><dd>' + esc(t || '09:00') + ' \u2013 ' + esc(addHours(t || '09:00', 2)) + '</dd></div>' +
            '<div><dt>Address</dt><dd>' + esc(addr.line) + '</dd></div>' +
            '<div><dt>Packages</dt><dd>' + esc($('#pk-packages').value) + '</dd></div>' +
            '<div><dt>Ready by</dt><dd>' + esc($('#pk-ready').value || 'Front desk') + '</dd></div>' +
          '</dl>' +
          '<p class="fxp__hint">This confirmation is generated in the browser for the review build. ' +
          'A live booking is created through the FedEx Pickup API.</p>' +
          '<div class="fxp__actions">' +
            '<a class="fxp__btn" href="create-shipment.html">Create a shipment</a>' +
            '<button type="button" class="fxp__btn fxp__btn--ghost" id="pk-again">Book another pickup</button>' +
          '</div>' +
        '</div>';

      on(doc.getElementById('pk-again'), 'click', function () {
        host.innerHTML = '';
        form.reset();
        if (dateEl) dateEl.value = iso;
        var blk = window.FX_ADDR && window.FX_ADDR.pickup;
        if (blk) blk.reset();
        form.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      host.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    function addHours(hhmm, n) {
      var parts = hhmm.split(':');
      var h = (parseInt(parts[0], 10) + n) % 24;
      return (h < 10 ? '0' : '') + h + ':' + (parts[1] || '00');
    }
  }

  /* ------------------------------------------------------------------
     7b. Support contact form
     ------------------------------------------------------------------ */
  function wireSupport() {
    var form = doc.getElementById('support-form');
    if (!form) return;
    var validate = wireValidation(form);
    var host = doc.getElementById('support-result');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!validate()) return;
      var name = doc.getElementById('sup-name').value.trim();
      var topic = doc.getElementById('sup-topic').value;
      var ref = 'CS-' + String(hash(name + topic + Date.now()) % 900000 + 100000);
      host.innerHTML =
        '<div class="fxp__alert fxp__alert--ok"><div><strong>Message sent.</strong><br>' +
        'Thanks, ' + esc(name.split(' ')[0]) + '. Your reference is <strong>' + esc(ref) +
        '</strong> and the topic is \u201c' + esc(topic) + '\u201d. A reply usually takes one ' +
        'business day.</div></div>';
      form.reset();
      $$('input, select, textarea', form).forEach(function (f) {
        f.removeAttribute('aria-invalid');
      });
    });
  }

  /* ------------------------------------------------------------------
     8. Sign up / log in
     ------------------------------------------------------------------ */
  var AUTH_KEY = 'fx-demo-account';

  function readAccount() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeAccount(a) {
    try {
      if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a));
      else localStorage.removeItem(AUTH_KEY);
    } catch (e) { /* private mode: session-only */ }
  }

  function wireAuth() {
    var root = doc.getElementById('auth-root');
    if (!root) return;

    var signedBox = doc.getElementById('auth-signed');
    var formsBox = doc.getElementById('auth-forms');
    var nameOut = doc.getElementById('auth-name');
    var mailOut = doc.getElementById('auth-mail');
    var initial = doc.getElementById('auth-initial');

    function paint() {
      var acct = readAccount();
      if (acct) {
        signedBox.hidden = false;
        formsBox.hidden = true;
        nameOut.textContent = acct.name;
        mailOut.textContent = acct.email;
        initial.textContent = (acct.name || '?').trim().charAt(0).toUpperCase();
      } else {
        signedBox.hidden = true;
        formsBox.hidden = false;
      }
    }

    var signup = doc.getElementById('signup-form');
    var login = doc.getElementById('login-form');
    var vSignup = signup ? wireValidation(signup) : null;
    var vLogin = login ? wireValidation(login) : null;

    if (signup) {
      signup.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!vSignup()) return;
        var pw = doc.getElementById('su-pass').value;
        var pw2 = doc.getElementById('su-pass2').value;
        if (pw !== pw2) {
          setErr(doc.getElementById('su-pass2'), 'The two passwords do not match.');
          doc.getElementById('su-pass2').focus();
          return;
        }
        writeAccount({
          name: doc.getElementById('su-name').value.trim(),
          email: doc.getElementById('su-email').value.trim(),
          since: new Date().toISOString()
        });
        paint();
        signedBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }

    if (login) {
      login.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!vLogin()) return;
        var email = doc.getElementById('li-email').value.trim();
        var pw = doc.getElementById('li-pass').value;
        var acct = readAccount();
        // Demo credentials: any email + any 8+ char password signs in. If an
        // account was created in this browser, its password is not stored, so
        // the email is matched but the password is only length-checked.
        if (acct && acct.email.toLowerCase() !== email.toLowerCase()) {
          setErr(doc.getElementById('li-email'), 'No account with that email in this browser. Sign up first.');
          return;
        }
        writeAccount({
          name: acct ? acct.name : email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
          email: email,
          since: acct ? acct.since : new Date().toISOString()
        });
        paint();
        signedBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }

    on(doc.getElementById('auth-signout'), 'click', function () {
      writeAccount(null);
      paint();
      if (signup) signup.reset();
      if (login) login.reset();
    });

    paint();
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  function boot() {
    wireNotices();
    wireFaq();
    wireTabs();
    wireTracking();
    wireRates();
    wireLocations();
    wirePickup();
    wireSupport();
    wireAuth();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
