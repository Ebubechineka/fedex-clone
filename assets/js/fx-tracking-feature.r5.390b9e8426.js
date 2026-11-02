/* ==========================================================================
   FedEx clone — working shipment tracking
   --------------------------------------------------------------------------
   Wires the two real tracking forms on the page:
     #HeaderTrackingModule      (header "Tracking" dropdown)
     #PageTrackingModule-large  (hero TRACK panel)
   Renders number + status badge + vertical scan timeline.

   WHERE TO PASTE YOUR API KEY
   ---------------------------
   Set the values in FX_TRACKING_CONFIG below. Nothing else needs editing.
   Leave apiKey empty and the widget runs in demo mode (sample timeline),
   so the page is never broken for a reviewer.

   Providers supported:  ship24 | aftership | 17track

   SECURITY NOTE (please read before going live):
   Any key placed here is visible to anyone who opens the page. That is fine
   for a review build. For production, put the key on a small server endpoint
   and set proxyUrl instead of apiKey - the browser then calls your endpoint
   and your key stays private. See buildUrl()/callApi() for the two modes.
   ========================================================================== */

window.FX_TRACKING_CONFIG = {
  /* ------- EDIT BELOW THIS LINE ---------------------------------------- */
  provider: 'ship24',        // 'ship24' | 'aftership' | '17track'
  apiKey: '',                // <-- PASTE YOUR TRACKING API KEY HERE

  // Optional: your own server endpoint that proxies the provider.
  // When set, it wins over apiKey. Receives {number, provider} as JSON.
  proxyUrl: '',

  // How long to wait before giving up on the provider (ms).
  timeoutMs: 20000
  /* ------- EDIT ABOVE THIS LINE ---------------------------------------- */
};

(function () {
  'use strict';

  var CFG = window.FX_TRACKING_CONFIG || {};
  var HAS_KEY = !!(CFG.apiKey && String(CFG.apiKey).trim()) || !!CFG.proxyUrl;
  var DEFAULT_ERRMSG = 'Please enter at least one tracking number.';

  /* --------------------------------------------------------------------
     Small helpers
     -------------------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cleanNumber(raw) {
    return String(raw || '').trim().replace(/\s+/g, '');
  }

  function isValidNumber(n) {
    return n.length >= 5 && n.length <= 40 && /^[A-Za-z0-9\-_.]+$/.test(n);
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }

  /* Stable 32-bit hash so the same number always gives the same demo result. */
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  /* --------------------------------------------------------------------
     Demo mode — a plausible FedEx-shaped timeline, clearly labelled.
     -------------------------------------------------------------------- */
  var HUBS = ['SAN JOSE, CA', 'OAKLAND, CA', 'MEMPHIS, TN', 'INDIANAPOLIS, IN',
              'NEWARK, NJ', 'LOS ANGELES, CA', 'DALLAS, TX', 'ATLANTA, GA'];
  var DESTS = ['SEATTLE, WA', 'AUSTIN, TX', 'BOSTON, MA', 'DENVER, CO',
               'NASHVILLE, TN', 'PHOENIX, AZ', 'CHICAGO, IL', 'MIAMI, FL'];

  function demoResult(number) {
    var h = hash(number);
    var hub = HUBS[h % HUBS.length];
    var hub2 = HUBS[(h >> 3) % HUBS.length];
    var dest = DESTS[(h >> 5) % DESTS.length];
    var scenario = h % 3;                // 0 in transit, 1 out for delivery, 2 delivered
    var now = Date.now();
    var H = 3600 * 1000;

    var events = [
      { at: now - 74 * H, status: 'Shipment information sent to FedEx', place: dest },
      { at: now - 66 * H, status: 'Picked up', place: hub },
      { at: now - 51 * H, status: 'Arrived at FedEx location', place: hub },
      { at: now - 40 * H, status: 'Departed FedEx location', place: hub },
      { at: now - 26 * H, status: 'In transit', place: hub2 },
      { at: now - 14 * H, status: 'Arrived at FedEx location', place: dest }
    ];

    var milestone = 'InTransit';
    var statusText = 'In transit';
    var eta = new Date(now + 1 * 24 * H).toISOString();

    if (scenario === 1) {
      events.push({ at: now - 3 * H, status: 'On FedEx vehicle for delivery', place: dest });
      milestone = 'OutForDelivery';
      statusText = 'Out for delivery';
      eta = new Date(now).toISOString();
    } else if (scenario === 2) {
      events.push({ at: now - 3 * H, status: 'On FedEx vehicle for delivery', place: dest });
      events.push({ at: now - 1 * H, status: 'Delivered - Left at front door', place: dest });
      milestone = 'Delivered';
      statusText = 'Delivered';
      eta = new Date(now - 1 * H).toISOString();
    }

    return {
      number: number,
      carrier: 'FedEx',
      service: 'FedEx International Priority',
      milestone: milestone,
      statusText: statusText,
      eta: eta,
      events: events.map(function (e) {
        return { at: new Date(e.at).toISOString(), status: e.status, place: e.place };
      }),
      demo: true
    };
  }

  /* --------------------------------------------------------------------
     Provider adapters
     -------------------------------------------------------------------- */
  function buildUrl(number) {
    var p = (CFG.provider || 'ship24').toLowerCase();
    if (p === 'aftership') {
      return 'https://api.aftership.com/v4/trackings?tracking_numbers=' +
             encodeURIComponent(number);
    }
    if (p === '17track') return 'https://api.17track.net/track/v2.2/gettrackinfo';
    return 'https://api.ship24.com/public/v1/trackers/track';
  }

  function buildRequest(number) {
    var p = (CFG.provider || 'ship24').toLowerCase();
    var key = String(CFG.apiKey || '').trim();

    if (p === 'aftership') {
      return {
        method: 'GET',
        headers: { 'aftership-api-key': key, 'Content-Type': 'application/json' }
      };
    }
    if (p === '17track') {
      return {
        method: 'POST',
        headers: { '17token': key, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ number: number }])
      };
    }
    // Ship24
    return {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ trackingNumber: number })
    };
  }

  /* Map a provider payload onto our neutral shape.
     Everything is optional-chained so a schema drift degrades instead of throwing. */
  function normalise(payload, number) {
    var p = (CFG.provider || 'ship24').toLowerCase();
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
        carrier: t.slug || '',
        service: (t.courier_redirect || '') ? '' : (t.title || ''),
        milestone: t.tag || '',
        statusText: (t.tag || '').replace(/_/g, ' '),
        eta: t.expected_delivery || '',
        events: cps
      };
    }

    if (p === '17track') {
      var acc = data && data.accepted && data.accepted[0];
      if (!acc) return null;
      var info = acc.track_info || {};
      var prov = (info.tracking && info.tracking.providers && info.tracking.providers[0]) || {};
      var ev17 = (prov.events || []).map(function (e) {
        return {
          at: e.time_iso || e.time_utc || e.time,
          status: e.description || e.stage || 'Update',
          place: e.location || ''
        };
      });
      if (!ev17.length) return null;
      return {
        number: acc.number || number,
        carrier: (prov.provider && prov.provider.name) || '',
        service: '',
        milestone: prov.stage || '',
        statusText: (prov.stage || '').replace(/_/g, ' '),
        eta: (info.time_metrics && info.time_metrics.estimated_delivery_date) || '',
        events: ev17
      };
    }

    // Ship24
    var trk = data && data.trackings && data.trackings[0];
    if (!trk) return null;
    var shipment = trk.shipment || {};
    var evs = (trk.events || []).map(function (e) {
      return {
        at: e.occurrenceDatetime || e.datetime,
        status: e.status || e.statusCode || 'Update',
        place: e.location || ''
      };
    });
    if (!evs.length) return null;
    return {
      number: trk.trackingNumber || number,
      carrier: (shipment.courierCode && (shipment.courierCode[0] || shipment.courierCode)) || '',
      service: '',
      milestone: shipment.statusMilestone || (trk.statusMilestone || ''),
      statusText: shipment.statusMilestone || trk.statusMilestone || 'In transit',
      eta: shipment.delivery && shipment.delivery.estimatedDeliveryDate || '',
      events: evs
    };
  }

  /* One place that performs the network call, with timeout + friendly errors. */
  function callApi(number) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); },
                           CFG.timeoutMs || 20000);

    // Proxy mode: our own endpoint, provider + number in the body.
    if (CFG.proxyUrl) {
      return fetch(CFG.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: number, provider: CFG.provider || 'ship24' }),
        signal: controller ? controller.signal : undefined
      }).then(readJson).finally(clear);
    }

    var req = buildRequest(number);
    if (controller) req.signal = controller.signal;
    return fetch(buildUrl(number), req).then(readJson).finally(clear);

    function clear() { clearTimeout(timer); }
  }

  function readJson(res) {
    return res.text().then(function (txt) {
      var body = null;
      try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = null; }
      if (res.status === 404) {
        var nf = new Error('notfound'); nf.code = 'notfound'; throw nf;
      }
      if (!res.ok) {
        var err = new Error('http'); err.code = 'http'; err.status = res.status; err.body = body;
        throw err;
      }
      return body;
    });
  }

  /* --------------------------------------------------------------------
     Rendering
     -------------------------------------------------------------------- */
  function badgeClass(milestone, statusText) {
    var s = (String(milestone || '') + ' ' + String(statusText || '')).toLowerCase();
    if (/delivered/.test(s)) return 'delivered';
    if (/outfor|out for delivery/.test(s)) return 'out';
    if (/exception|failed|returned|refused|cancel/.test(s)) return 'exception';
    if (/transit|picked|departed|arrived|info/.test(s)) return 'transit';
    if (/pending|pre-?transit|not found/.test(s)) return 'pending';
    return 'unknown';
  }

  function titleCase(s) {
    return String(s || '')
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /* Carrier names keep their own casing — "FedEx" must not become "Fed Ex".
     Only provider codes/slugs need prettifying. */
  var CARRIER_NAMES = {
    fedex: 'FedEx', ups: 'UPS', usps: 'USPS', dhl: 'DHL',
    dhl_express: 'DHL Express', dhl_ecommerce: 'DHL eCommerce',
    ontrac: 'OnTrac', lasership: 'LaserShip'
  };
  function carrierLabel(v) {
    if (!v) return '';
    var k = String(v).toLowerCase().replace(/\s+/g, '_');
    return CARRIER_NAMES[k] || titleCase(v);
  }

  /* --------------------------------------------------------------------
     Result surface.
     A tracking result is far taller than the 125px hero panel it belongs to,
     so rendering it inline used to stretch the hero and shove every section
     below it down the page. It now opens in a dialog styled with the site's
     own tokens, which leaves the underlying layout pixel-identical.
     -------------------------------------------------------------------- */
  var dialog = null;
  var lastFocus = null;

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('div');
    dialog.className = 'fx-trk-dialog';
    dialog.setAttribute('hidden', '');
    dialog.innerHTML =
      '<div class="fx-trk-dialog__scrim" data-fx-close></div>' +
      '<div class="fx-trk-dialog__box" role="dialog" aria-modal="true" ' +
           'aria-labelledby="fx-trk-dialog-title">' +
        '<div class="fx-trk-dialog__bar">' +
          '<h2 class="fx-trk-dialog__title" id="fx-trk-dialog-title">Tracking</h2>' +
          '<button type="button" class="fx-trk-dialog__close" data-fx-close ' +
                  'aria-label="Close tracking results">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
              '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" ' +
                    'stroke-linecap="round"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="fx-trk-dialog__body"></div>' +
      '</div>';
    document.body.appendChild(dialog);

    dialog.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-fx-close]')) closeDialog();
    });
    document.addEventListener('keydown', function (ev) {
      if (!dialog.hasAttribute('hidden') && ev.key === 'Escape') closeDialog();
    });
    return dialog;
  }

  function openDialog() {
    var d = ensureDialog();
    if (d.hasAttribute('hidden')) {
      lastFocus = document.activeElement;
      d.removeAttribute('hidden');
      document.body.classList.add('fx-trk-locked');
      var btn = d.querySelector('.fx-trk-dialog__close');
      if (btn) btn.focus();
    }
    return d.querySelector('.fx-trk-dialog__body');
  }

  function closeDialog() {
    if (!dialog || dialog.hasAttribute('hidden')) return;
    dialog.setAttribute('hidden', '');
    document.body.classList.remove('fx-trk-locked');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderResult(host, r) {
    var events = (r.events || []).slice().sort(function (a, b) {
      return new Date(b.at) - new Date(a.at);
    });

    // Clear the inline loading state so it cannot add height to the page.
    if (host) host.innerHTML = '';

    var badge = badgeClass(r.milestone, r.statusText);
    var statusLabel = titleCase(r.statusText || r.milestone || 'In transit');

    var rows = events.map(function (e, i) {
      var cls = 'fx-trk__ev';
      if (i === 0) cls += ' fx-trk__ev--latest';
      if (/delivered/i.test(e.status || '')) cls += ' fx-trk__ev--delivered';
      return '' +
        '<li class="' + cls + '">' +
          '<span class="fx-trk__dot" aria-hidden="true"></span>' +
          '<span class="fx-trk__ev-body">' +
            '<span class="fx-trk__ev-when">' + esc(fmtDate(e.at)) + '</span>' +
            '<span class="fx-trk__ev-status">' + esc(e.status || 'Update') +
              (i === 0 ? '<span class="fx-trk__here">Latest</span>' : '') +
            '</span>' +
            (e.place ? '<span class="fx-trk__ev-place">' + esc(e.place) + '</span>' : '') +
          '</span>' +
        '</li>';
    }).join('');

    var meta = [];
    if (r.carrier) meta.push(['Carrier', carrierLabel(r.carrier)]);
    if (r.service) meta.push(['Service', r.service]);
    if (r.eta) meta.push([badge === 'delivered' ? 'Delivered' : 'Estimated delivery', fmtDate(r.eta)]);
    meta.push(['Scan events', events.length + '']);

    var metaHtml = meta.map(function (m) {
      return '<div><dt>' + esc(m[0]) + '</dt><dd>' + esc(m[1]) + '</dd></div>';
    }).join('');

    var surface = openDialog();

    surface.innerHTML = '' +
      '<div class="fx-trk__card" role="region" aria-label="Tracking results">' +
        '<div class="fx-trk__head">' +
          '<p class="fx-trk__eyebrow">Tracking number</p>' +
          '<p class="fx-trk__number">' + esc(r.number) + '</p>' +
          '<button type="button" class="fx-trk__copy" data-fx-copy="' + esc(r.number) + '">Copy</button>' +
          '<span class="fx-trk__badge fx-trk__badge--' + badge + '">' + esc(statusLabel) + '</span>' +
          (r.demo ? '<span class="fx-trk__demo-tag">Demo data</span>' : '') +
        '</div>' +
        '<dl class="fx-trk__meta">' + metaHtml + '</dl>' +
        '<p class="fx-trk__tl-title">Shipment history</p>' +
        '<div class="fx-trk__tl-wrap">' +
          '<ol class="fx-trk__timeline">' + rows + '</ol>' +
        '</div>' +
        (r.demo
          ? '<p class="fx-trk__note">Sample timeline — no tracking API key is configured,' +
            ' so this result is generated locally to show the widget working.</p>'
          : '<p class="fx-trk__note">Live data from your tracking provider. ' +
            'Times shown are the courier\'s local scan times.</p>') +
      '</div>';

    var copyBtn = surface.querySelector('[data-fx-copy]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var val = copyBtn.getAttribute('data-fx-copy');
        var done = function () {
          copyBtn.textContent = 'Copied';
          setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1600);
        };
        var legacyCopy = function () {
          var ta = document.createElement('textarea');
          ta.value = val;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); done(); } catch (e) {}
          document.body.removeChild(ta);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          // If the browser denies clipboard access, fall back instead of doing nothing.
          navigator.clipboard.writeText(val).then(done, legacyCopy);
        } else {
          legacyCopy();
        }
      });
    }

    // Fade cue: hide it once the visitor has scrolled to the oldest scan.
    var tl = surface.querySelector('.fx-trk__timeline');
    var wrap = surface.querySelector('.fx-trk__tl-wrap');
    if (tl && wrap) {
      var sync = function () {
        var atBottom = tl.scrollTop + tl.clientHeight >= tl.scrollHeight - 4;
        wrap.classList.toggle('is-at-bottom', atBottom);
      };
      var overflows = tl.scrollHeight > tl.clientHeight + 4;
      if (!overflows) wrap.classList.add('is-at-bottom');
      tl.addEventListener('scroll', sync);
      sync();
    }
  }

  function renderLoading(host) {
    // Short-lived states render in the dialog too: anything inline would add
    // height to the hero and shift the rest of the page while it loads.
    var surface = openDialog();
    surface.innerHTML = '' +
      '<div class="fx-trk__state" role="status" aria-live="polite">' +
        '<span class="fx-trk__spinner" aria-hidden="true"></span>' +
        '<p><strong>Tracking your shipment…</strong>' +
        'Fetching the latest scans. This usually takes a few seconds.</p>' +
      '</div>';
  }

  function renderNotFound(host, number) {
    var hostEl = openDialog();
    hostEl.innerHTML = '' +
      '<div class="fx-trk__state fx-trk__state--notfound" role="alert">' +
        iconAlert() +
        '<p><strong>We couldn\'t find that tracking number</strong>' +
        'No shipment matches <span style="font-weight:700">' + esc(number) + '</span>. ' +
        'Check the number and try again — FedEx tracking numbers are usually 12 or 15 digits.</p>' +
      '</div>';
  }

  function renderError(host, detail) {
    var hostEl = openDialog();
    hostEl.innerHTML = '' +
      '<div class="fx-trk__state fx-trk__state--error" role="alert">' +
        iconAlert() +
        '<p><strong>We couldn\'t retrieve tracking right now</strong>' +
        esc(detail || 'The tracking service did not respond. Please try again in a moment.') +
        '</p>' +
      '</div>';
  }

  function iconAlert() {
    return '<svg class="fx-trk__state-ico" width="22" height="22" viewBox="0 0 24 24" ' +
      'fill="none" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10" stroke="#de002e" stroke-width="2"/>' +
      '<path d="M12 7.5v5.5" stroke="#de002e" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="12" cy="16.6" r="1.15" fill="#de002e"/></svg>';
  }

  /* --------------------------------------------------------------------
     Field-level validation using FedEx's own error markup
     -------------------------------------------------------------------- */
  function setFieldError(form, message) {
    var input = form.querySelector('input[name="trackingNumber"]');
    var errBox = form.querySelector('.fxg-field__error_text');
    if (input) input.classList.toggle('is-invalid', !!message);
    if (!errBox) return;
    if (message) {
      var span = errBox.querySelector('span');
      if (span) span.textContent = message;
      errBox.classList.add('show');
      if (input) input.setAttribute('aria-invalid', 'true');
    } else {
      var sp = errBox.querySelector('span');
      if (sp) sp.textContent = DEFAULT_ERRMSG;
      errBox.classList.remove('show');
      if (input) input.removeAttribute('aria-invalid');
    }
  }

  /* --------------------------------------------------------------------
     Wire one form
     -------------------------------------------------------------------- */
  function wire(form, opts) {
    if (!form || form.dataset.fxTrkWired === '1') return;
    form.dataset.fxTrkWired = '1';

    // Take over from FedEx's own script: no POST, no new tab, no native bubble.
    form.setAttribute('novalidate', 'novalidate');
    form.setAttribute('action', 'javascript:void(0)');
    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.removeAttribute('target');
      submitBtn.setAttribute('type', 'button');   // we call handle() ourselves
      submitBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        handle(form);
      });
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      handle(form);
    });

    var input = form.querySelector('input[name="trackingNumber"]');
    if (input) {
      input.addEventListener('input', function () {
        if (input.value.trim()) setFieldError(form, '');
      });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          handle(form);
        }
      });
    }

    // Result host lives inside the same module wrapper, right under the form.
    var moduleWrap = form.closest('.fxg-tracking-module') || form.parentNode;
    var host = document.createElement('div');
    host.className = 'fx-trk' + (opts && opts.compact ? ' fx-trk--compact' : '');
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('data-fx-trk-out', '');
    moduleWrap.appendChild(host);

    // Deep link: ?trackingNumber=1Z... fills both fields and runs the lookup.
    var preset = new URLSearchParams(location.search).get('trackingNumber');
    if (preset && input && !input.value) {
      input.value = preset;
      handle(form);
    }
  }

  var inFlight = {};

  function handle(form) {
    var input = form.querySelector('input[name="trackingNumber"]');
    var host = form.parentNode.querySelector('[data-fx-trk-out]') ||
               (form.closest('.fxg-tracking-module') || form.parentNode)
                 .querySelector('[data-fx-trk-out]');
    if (!input || !host) return;

    var number = cleanNumber(input.value);

    if (!number) {
      setFieldError(form, DEFAULT_ERRMSG);
      input.focus();
      return;
    }
    if (!isValidNumber(number)) {
      setFieldError(form, 'That doesn\'t look like a valid tracking number. ' +
                          'Use letters and numbers only (5–40 characters).');
      input.focus();
      return;
    }
    setFieldError(form, '');

    // Guard against double-clicks.
    if (inFlight[number]) return;
    inFlight[number] = true;

    renderLoading(host);

    var paint = function (r) {
      if (!r) { renderNotFound(host, number); return; }
      renderResult(host, r);
    };

    if (!HAS_KEY) {
      // Demo mode: simulate the round trip so the loading state is visible.
      setTimeout(function () {
        paint(demoResult(number));
        delete inFlight[number];
      }, 650);
      return;
    }

    callApi(number).then(function (payload) {
      paint(normalise(payload, number));
    }).catch(function (err) {
      var code = err && err.code;
      if (code === 'notfound') {
        renderNotFound(host, number);
      } else if (err && err.name === 'AbortError') {
        renderError(host, 'The tracking service took too long to respond. Please try again.');
      } else if (code === 'http' && err.status === 401 || err.status === 403) {
        renderError(host, 'The tracking API rejected the key. Check FX_TRACKING_CONFIG.apiKey.');
      } else if (code === 'http' && err.status === 429) {
        renderError(host, 'Too many lookups in a short time. Please wait a moment and retry.');
      } else if (err instanceof TypeError) {
        // fetch() rejects with TypeError on CORS/network failure
        renderError(host, 'The browser could not reach the tracking service. ' +
          'If you are using an API key directly in the browser, the provider may be ' +
          'blocking client-side calls — use proxyUrl instead.');
      } else {
        renderError(host, 'The tracking service returned an unexpected response.');
      }
    }).finally(function () {
      delete inFlight[number];
    });
  }

  /* --------------------------------------------------------------------
     Make the header nav dropdowns openable.
     The clone has the markup + the .fxg-dropdown__item--open CSS, but the
     original trigger script is not bundled, so the Tracking panel (and the
     tracking form inside it) could never be reached. This restores the
     site's own designed behaviour using its own class — no styling added.
     -------------------------------------------------------------------- */
  function enableNavDropdowns() {
    // The page's inline handlers call FDX.DTM.pushLinkInfo(), but the clone has
    // no analytics bundle, so that throws and would kill the click before our
    // handler runs. Provide a no-op so the nav behaves like the real site.
    window.FDX = window.FDX || {};
    if (!window.FDX.DTM) {
      window.FDX.DTM = {
        pushLinkInfo: function () {},
        pushButtonInfo: function () {}
      };
    }

    var items = document.querySelectorAll('.fxg-dropdown__list .fxg-dropdown__item');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var trigger = item.querySelector(':scope > .fxg-link.fxg-dropdown-js') ||
                      item.querySelector(':scope > .fxg-link');
        if (!trigger) return;
        var open = function () { item.classList.add('fxg-dropdown__item--open'); };
        var close = function () { item.classList.remove('fxg-dropdown__item--open'); };

        item.addEventListener('mouseenter', open);
        item.addEventListener('mouseleave', close);
        trigger.addEventListener('focus', open);
        trigger.addEventListener('click', function (ev) {
          // Only swallow the click for real dropdown toggles. A plain link
          // inside the nav (e.g. Create Shipment) must navigate normally.
          var href = trigger.getAttribute('href') || '';
          var isToggle = href === '#' || href === '' || /^javascript:/i.test(href);
          if (!isToggle) return;
          ev.preventDefault();
          // keep it open once clicked, so the field can be typed into
          if (item.classList.contains('fxg-dropdown__item--open')) {
            item.classList.add('fxg-dropdown__item--pinned');
          } else {
            open();
            item.classList.add('fxg-dropdown__item--pinned');
          }
        });
        // leave it open while the visitor is typing / tabbing inside it
        item.addEventListener('focusout', function (ev) {
          if (!item.contains(ev.relatedTarget)) {
            item.classList.remove('fxg-dropdown__item--pinned');
          }
        });
        item.addEventListener('mouseleave', function () {
          if (!item.classList.contains('fxg-dropdown__item--pinned')) close();
        });
        item.addEventListener('keydown', function (ev) {
          if (ev.key === 'Escape') { close(); trigger.focus(); }
        });
      })(items[i]);
    }
  }

  /* --------------------------------------------------------------------
     Boot
     -------------------------------------------------------------------- */
  function boot() {
    enableNavDropdowns();
    wire(document.getElementById('HeaderTrackingModule'), { compact: true });
    wire(document.getElementById('PageTrackingModule-large'), { compact: false });

    // Any other tracking module the page may render later.
    var extra = document.querySelectorAll('.fxg-tracking-module form.fxg-form');
    for (var i = 0; i < extra.length; i++) {
      if (extra[i].id !== 'HeaderTrackingModule' &&
          extra[i].id !== 'PageTrackingModule-large' &&
          extra[i].id !== 'fxg-search-header' &&
          extra[i].id !== 'HomepageLocationsApp') {
        wire(extra[i], { compact: false });
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
