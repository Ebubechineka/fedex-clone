/* fx-address.r2.js — Country -> State/Region -> Postcode cascade (lazy data).
   r2 changes vs r1: the 226 KB combined dataset is gone. The country index
   (61 KB) is fetched the first time a country dropdown is opened, and each
   country's subdivision list is fetched only when that country is chosen.
   Everything is same-origin, cached, and works offline after first use.

   Public API is unchanged: window.FXAddress.{countries, byCode, CountryPicker,
   AddressBlock, subdivisions, postalRule}. */
(function () {
  'use strict';

  var GEO_BASE = 'assets/js/geo/';
  var COUNTRIES_URL = GEO_BASE + 'countries.3e6f908507.js';

  var DATA = null;          // { countries: [...] } once loaded
  var BY_CODE = {};
  var subsCache = {};       // cc -> array
  var loading = {};         // url -> Promise
  var uid = 0;

  /* ---------------------------------------------------------------------
     Lazy script loader — one <script> per URL, deduped, cached by the
     browser. No fetch/XHR so it works from file:// too.
     --------------------------------------------------------------------- */
  function loadScript(url) {
    if (loading[url]) return loading[url];
    loading[url] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('failed to load ' + url)); };
      document.head.appendChild(s);
    });
    return loading[url];
  }

  function ensureCountries() {
    if (DATA) return Promise.resolve(DATA);
    return loadScript(COUNTRIES_URL).then(function () {
      var raw = window.FX_GEO_COUNTRIES;
      if (!raw || !raw.countries) throw new Error('country index missing');
      DATA = raw;
      for (var i = 0; i < DATA.countries.length; i++) {
        BY_CODE[DATA.countries[i].code] = DATA.countries[i];
      }
      return DATA;
    });
  }

  function ensureSubs(cc) {
    if (subsCache[cc]) return Promise.resolve(subsCache[cc]);
    var c = BY_CODE[cc];
    if (!c) return Promise.resolve([]);
    if (!c.n) { subsCache[cc] = []; return Promise.resolve([]); }
    return loadScript(GEO_BASE + 's-' + cc + '.r2.js').then(function () {
      var all = window.FX_GEO_SUBS || {};
      subsCache[cc] = all[cc] || [];
      return subsCache[cc];
    }).catch(function () {
      subsCache[cc] = [];
      return [];
    });
  }

  function $(id) { return document.getElementById(id); }
  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function norm(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function countryMatches(c, q) {
    if (!q) return true;
    if (norm(c.name).indexOf(q) !== -1) return true;
    if (norm(c.code) === q) return true;
    if (c.alias && norm(c.alias).indexOf(q) !== -1) return true;
    return false;
  }

  function rank(c, q) {
    if (!q) return 3;
    var n = norm(c.name);
    if (norm(c.code) === q) return 0;
    if (n.indexOf(q) === 0) return 1;
    if (n.indexOf(q) !== -1) return 2;
    if (c.alias && norm(c.alias).indexOf(q) !== -1) return 3;
    return 4;
  }

  /* ---------------------------------------------------------------------
     CountryPicker — searchable combobox (WAI-ARIA 1.2 pattern)
     --------------------------------------------------------------------- */
  function CountryPicker(opts) {
    this.host = opts.host;
    this.name = opts.name || 'country';
    this.id = opts.id || ('fxa-country-' + (++uid));
    this.onChange = opts.onChange || function () {};
    this.value = '';
    this.open = false;
    this.activeIdx = 0;
    this.filtered = [];
    this.scrim = null;
    this.build();
  }

  CountryPicker.prototype.build = function () {
    var self = this;

    this.host.classList.add('fxa');
    this.host.innerHTML = '';

    var btn = el('button');
    btn.type = 'button';
    btn.className = 'fxa__btn';
    btn.id = this.id;
    btn.setAttribute('role', 'combobox');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', this.id + '-list');
    btn.setAttribute('aria-label', this.label || 'Country');

    var flag = el('span', 'fxa__flag');
    var val = el('span', 'fxa__val fxa__val--empty');
    val.textContent = 'Select a country';
    var caret = el('span', 'fxa__caret');
    caret.setAttribute('aria-hidden', 'true');
    btn.appendChild(flag);
    btn.appendChild(val);
    btn.appendChild(caret);

    var hidden = el('input');
    hidden.type = 'hidden';
    hidden.name = this.name;
    hidden.id = this.id + '-value';
    hidden.value = '';

    var pop = el('div', 'fxa__pop');
    pop.setAttribute('data-open', '0');
    pop.id = this.id + '-pop';

    var sw = el('div', 'fxa__searchwrap');
    var search = el('input');
    search.type = 'text';
    search.className = 'fxa__search';
    search.id = this.id + '-search';
    search.setAttribute('role', 'searchbox');
    search.setAttribute('autocomplete', 'off');
    search.setAttribute('placeholder', 'Search 249 countries\u2026');
    search.setAttribute('aria-label', 'Search countries');
    search.setAttribute('aria-controls', this.id + '-list');
    search.setAttribute('aria-autocomplete', 'list');
    search.setAttribute('aria-expanded', 'false');
    sw.appendChild(search);

    var count = el('div', 'fxa__count');
    count.id = this.id + '-count';
    count.textContent = 'Loading countries\u2026';

    var list = el('ul');
    list.className = 'fxa__list';
    list.id = this.id + '-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', this.id);
    list.tabIndex = -1;

    pop.appendChild(sw);
    pop.appendChild(count);
    pop.appendChild(list);

    this.host.appendChild(btn);
    this.host.appendChild(hidden);
    this.host.appendChild(pop);

    this.btn = btn;
    this.valNode = val;
    this.flagNode = flag;
    this.hidden = hidden;
    this.pop = pop;
    this.search = search;
    this.countNode = count;
    this.list = list;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (self.open) self.close(); else self.openPanel();
    });
    btn.addEventListener('keydown', function (e) { self.onButtonKey(e); });

    search.addEventListener('input', function () { self.render(search.value); });
    search.addEventListener('keydown', function (e) { self.onSearchKey(e); });

    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest ? e.target.closest('[data-code]') : null;
      if (!li) return;
      e.preventDefault();
      self.select(li.getAttribute('data-code'));
    });

    list.addEventListener('mousemove', function (e) {
      var li = e.target.closest ? e.target.closest('[data-code]') : null;
      if (!li) return;
      var idx = parseInt(li.getAttribute('data-idx'), 10);
      if (!isNaN(idx) && idx !== self.activeIdx) {
        self.activeIdx = idx;
        self.paintActive();
      }
    });

    document.addEventListener('mousedown', function (e) {
      if (!self.open) return;
      if (self.host.contains(e.target)) return;
      if (self.scrim && self.scrim.contains(e.target)) return;
      self.close();
    });

    document.addEventListener('keydown', function (e) {
      if (self.open && e.key === 'Escape') { e.preventDefault(); self.close(); self.btn.focus(); }
    });
  };

  CountryPicker.prototype.setLabel = function (label) {
    this.label = label;
    this.btn.setAttribute('aria-label', label);
  };

  CountryPicker.prototype.openPanel = function () {
    if (this.open) return;
    this.open = true;
    this.btn.setAttribute('aria-expanded', 'true');
    this.pop.setAttribute('data-open', '1');
    this.search.setAttribute('aria-expanded', 'true');

    if (window.matchMedia && window.matchMedia('(max-width: 600px)').matches) {
      this.scrim = el('div', 'fxa__scrim');
      var self0 = this;
      this.scrim.addEventListener('click', function () { self0.close(); });
      document.body.appendChild(this.scrim);
      document.body.classList.add('fxa-noscroll');
    }

    this.search.value = '';
    var self = this;

    // First open pays for the country index; later opens are instant.
    if (!DATA) {
      this.countNode.textContent = 'Loading countries\u2026';
      this.list.innerHTML = '<li class="fxa__empty">Loading the country list\u2026</li>';
      ensureCountries().then(function () {
        if (!self.open) return;
        self.render('');
        self.search.focus();
      }).catch(function () {
        self.countNode.textContent = 'Unavailable';
        self.list.innerHTML = '<li class="fxa__empty">The country list could not be loaded. ' +
          'Check your connection and try again.</li>';
      });
    } else {
      this.render('');
    }

    requestAnimationFrame(function () {
      self.search.focus();
      self.scrollActiveIntoView();
    });
  };

  CountryPicker.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    this.btn.setAttribute('aria-expanded', 'false');
    this.pop.setAttribute('data-open', '0');
    this.search.setAttribute('aria-expanded', 'false');
    if (this.scrim) {
      if (this.scrim.parentNode) this.scrim.parentNode.removeChild(this.scrim);
      this.scrim = null;
      document.body.classList.remove('fxa-noscroll');
    }
  };

  CountryPicker.prototype.render = function (q) {
    if (!DATA) return;
    var query = norm(q);
    var hits = [];
    for (var i = 0; i < DATA.countries.length; i++) {
      var c = DATA.countries[i];
      if (countryMatches(c, query)) hits.push(c);
    }
    if (query) {
      hits.sort(function (a, b) {
        var ra = rank(a, query), rb = rank(b, query);
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
      if (hits.length > 60) hits = hits.slice(0, 60);
    }
    this.filtered = hits;
    this.activeIdx = 0;

    if (!hits.length) {
      this.countNode.textContent = 'No match';
      this.list.innerHTML = '<li class="fxa__empty">No country matches \u201c' + esc(q) +
        '\u201d. Check the spelling, or clear the search to see all 249 countries.</li>';
      return;
    }

    this.countNode.textContent = query
      ? hits.length + (hits.length === 1 ? ' match' : ' matches')
      : 'All 249 countries';

    var html = '';
    for (var j = 0; j < hits.length; j++) {
      var cc = hits[j];
      html += '<li class="fxa__opt" role="option" data-code="' + cc.code + '" data-idx="' + j +
        '" aria-selected="' + (cc.code === this.value ? 'true' : 'false') + '">' +
        '<span class="fxa__flag" aria-hidden="true">' + cc.flag + '</span>' +
        '<span class="fxa__code">' + cc.code + '</span>' +
        '<span class="fxa__name">' + esc(cc.name) + '</span></li>';
    }
    this.list.innerHTML = html;
    this.paintActive();
  };

  CountryPicker.prototype.paintActive = function () {
    var nodes = this.list.querySelectorAll('.fxa__opt');
    for (var i = 0; i < nodes.length; i++) {
      if (i === this.activeIdx) {
        nodes[i].setAttribute('data-active', '1');
        this.btn.setAttribute('aria-activedescendant', nodes[i].id || '');
      } else {
        nodes[i].removeAttribute('data-active');
      }
    }
  };

  CountryPicker.prototype.scrollActiveIntoView = function () {
    var node = this.list.children[this.activeIdx];
    if (!node) return;
    var top = node.offsetTop;
    var bot = top + node.offsetHeight;
    if (top < this.list.scrollTop) this.list.scrollTop = top;
    else if (bot > this.list.scrollTop + this.list.clientHeight) {
      this.list.scrollTop = bot - this.list.clientHeight;
    }
  };

  CountryPicker.prototype.move = function (delta) {
    if (!this.filtered.length) return;
    this.activeIdx += delta;
    if (this.activeIdx < 0) this.activeIdx = this.filtered.length - 1;
    if (this.activeIdx >= this.filtered.length) this.activeIdx = 0;
    this.paintActive();
    this.scrollActiveIntoView();
  };

  CountryPicker.prototype.onButtonKey = function (e) {
    var k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') {
      e.preventDefault();
      this.openPanel();
    } else if (k === 'Escape') {
      this.close();
    } else if (k && k.length === 1 && /[a-zA-Z]/.test(k)) {
      e.preventDefault();
      this.openPanel();
      this.search.value = k;
      this.render(k);
    }
  };

  CountryPicker.prototype.onSearchKey = function (e) {
    var k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); this.move(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); this.move(-1); }
    else if (k === 'PageDown') { e.preventDefault(); this.move(8); }
    else if (k === 'PageUp') { e.preventDefault(); this.move(-8); }
    else if (k === 'Home') { e.preventDefault(); this.activeIdx = 0; this.paintActive(); this.scrollActiveIntoView(); }
    else if (k === 'End') { e.preventDefault(); this.activeIdx = this.filtered.length - 1; this.paintActive(); this.scrollActiveIntoView(); }
    else if (k === 'Enter') {
      e.preventDefault();
      if (this.filtered[this.activeIdx]) this.select(this.filtered[this.activeIdx].code);
    } else if (k === 'Escape') {
      e.preventDefault();
      this.close();
      this.btn.focus();
    } else if (k === 'Tab') {
      if (this.filtered[this.activeIdx]) this.select(this.filtered[this.activeIdx].code);
    }
  };

  CountryPicker.prototype.select = function (code) {
    var c = BY_CODE[code];
    if (!c) return;
    var changed = this.value !== code;
    this.value = code;
    this.hidden.value = code;
    this.hidden.setAttribute('data-picked', '1');

    this.flagNode.textContent = c.flag;
    this.valNode.textContent = c.name;
    this.valNode.classList.remove('fxa__val--empty');
    this.close();
    this.btn.focus();
    this.onChange(c, changed);
  };

  CountryPicker.prototype.setValue = function (code, silent) {
    var c = BY_CODE[code];
    if (!c) return;
    this.value = code;
    this.hidden.value = code;
    this.hidden.setAttribute('data-picked', '1');
    this.flagNode.textContent = c.flag;
    this.valNode.textContent = c.name;
    this.valNode.classList.remove('fxa__val--empty');
    if (!silent) this.onChange(c, true);
  };

  CountryPicker.prototype.reset = function () {
    this.value = '';
    this.hidden.value = '';
    this.hidden.removeAttribute('data-picked');
    this.flagNode.textContent = '';
    this.valNode.textContent = 'Select a country';
    this.valNode.classList.add('fxa__val--empty');
    this.close();
  };

  CountryPicker.prototype.setDisabled = function (disabled) {
    this.btn.disabled = !!disabled;
  };

  /* ---------------------------------------------------------------------
     AddressBlock — country + state/region + postcode, wired together
     --------------------------------------------------------------------- */
  function AddressBlock(cfg) {
    this.cfg = cfg;
    this.subs = [];
    this.build();
  }

  AddressBlock.prototype.build = function () {
    var cfg = this.cfg;
    var self = this;

    var countryHost = $(cfg.countryHost);
    var subHost = $(cfg.stateHost);

    if (!countryHost) return;

    this.country = new CountryPicker({
      host: countryHost,
      name: cfg.countryName || 'country',
      id: cfg.prefix + '-country',
      label: cfg.countryLabel || 'Country',
      onChange: function (c, changed) { self.applyCountry(c, changed); }
    });

    if (subHost) {
      subHost.classList.add('fxa');
      var sel = el('select');
      sel.className = 'fxa__state';
      sel.id = cfg.stateSelectId;
      sel.name = cfg.stateName || 'state';
      sel.setAttribute('aria-describedby', 'hint-' + cfg.prefix + '-state');
      sel.disabled = true;
      subHost.appendChild(sel);

      var txt = el('input');
      txt.type = 'text';
      txt.className = 'fxa__state';
      txt.id = cfg.stateTextId;
      txt.name = cfg.stateName || 'state';
      txt.setAttribute('autocomplete', 'address-level1');
      txt.setAttribute('maxlength', '80');
      txt.setAttribute('aria-describedby', 'hint-' + cfg.prefix + '-state');
      txt.disabled = true;
      txt.hidden = true;
      subHost.appendChild(txt);

      var hint = el('p', 'fxa__hint');
      hint.id = 'hint-' + cfg.prefix + '-state';
      hint.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">' +
        '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
        '</svg><span>Choose a country first</span>';
      subHost.appendChild(hint);

      this.stateSelect = sel;
      this.stateText = txt;
      this.stateHint = hint;

      sel.addEventListener('change', function () {
        if (sel.value) { sel.removeAttribute('aria-invalid'); }
      });
    }

    var pcInput = $(cfg.postcodeId);
    if (pcInput) {
      var input = pcInput;
      this.postcode = input;
      this.pcLabel = document.querySelector('label[for="' + cfg.postcodeId + '"]');

      var fmt = el('span', 'fxa__fmt');
      fmt.id = 'fmt-' + cfg.prefix + '-pc';
      fmt.hidden = true;
      input.parentNode.insertBefore(fmt, input.nextSibling);
      input.setAttribute('aria-describedby',
        (input.getAttribute('aria-describedby') || '') + ' ' + fmt.id);
      this.pcFmt = fmt;

      input.disabled = true;
      input.setAttribute('placeholder', 'Select a country first');
      input.addEventListener('input', function () { self.checkPostcode(true); });
      input.addEventListener('blur', function () { self.checkPostcode(false); });
    }

    this.applyCountry(null, true, true);
  };

  AddressBlock.prototype.applyCountry = function (c, changed, initial) {
    var cfg = this.cfg;
    var self = this;

    if (!c) {
      if (this.stateSelect) {
        this.stateSelect.innerHTML = '<option value="">Select a country first</option>';
        this.stateSelect.disabled = true;
        this.stateSelect.hidden = false;
        this.stateText.hidden = true;
        this.stateText.disabled = true;
        this.stateHint.hidden = false;
        this.stateHint.lastChild.textContent = 'Choose a country first';
        this.pointLabelAt(cfg.stateSelectId);
      }
      if (this.postcode) {
        this.postcode.disabled = true;
        this.postcode.value = '';
        this.postcode.setAttribute('placeholder', 'Select a country first');
        this.postcode.removeAttribute('data-pattern');
      }
      if (this.pcFmt) this.pcFmt.hidden = true;
      return;
    }

    // Postcode rules are on the country record, so they apply immediately.
    this.applyPostcodeRules(c);

    // Subdivisions arrive asynchronously; show a loading state meanwhile.
    if (this.stateSelect) {
      this.stateSelect.innerHTML = '<option value="">Loading\u2026</option>';
      this.stateSelect.disabled = true;
      this.stateHint.hidden = false;
      this.stateHint.lastChild.textContent = 'Loading ' + c.subLabel.toLowerCase() + ' list\u2026';
    }

    ensureSubs(c.code).then(function (subs) {
      // Guard against a slower response for a country the user already left.
      if (self.country.value !== c.code) return;
      self.renderSubs(c, subs);
    });
  };

  AddressBlock.prototype.renderSubs = function (c, subs) {
    var cfg = this.cfg;
    this.subs = subs || [];

    if (this.stateSelect) {
      var hasList = this.subs.length > 0;
      if (hasList) {
        var html = '<option value="">Select a ' + c.subLabel.toLowerCase() + '</option>';
        for (var i = 0; i < this.subs.length; i++) {
          html += '<option value="' + esc(this.subs[i].code) + '">' + esc(this.subs[i].name) + '</option>';
        }
        this.stateSelect.innerHTML = html;
        this.stateSelect.disabled = false;
        this.stateSelect.hidden = false;
        this.stateText.hidden = true;
        this.stateText.disabled = true;
        this.stateHint.hidden = true;
        this.pointLabelAt(cfg.stateSelectId);
      } else {
        this.stateSelect.innerHTML = '<option value="">Not used here</option>';
        this.stateSelect.disabled = true;
        this.stateSelect.hidden = true;
        this.stateText.hidden = false;
        this.stateText.disabled = false;
        this.stateText.value = '';
        this.pointLabelAt(cfg.stateTextId);
        this.stateText.setAttribute('placeholder', c.subLabel);
        this.stateHint.hidden = false;
        this.stateHint.lastChild.textContent =
          c.name + ' has no fixed ' + c.subLabel.toLowerCase() + ' list \u2014 type it in';
      }
    }

    var sl = document.querySelector('label[for="' + cfg.stateSelectId + '"]');
    if (sl) {
      var sreq = sl.querySelector('.fx-shp__req, .fxp__req, .fx-shp__opt, .fxp__opt');
      sl.innerHTML = esc(c.subLabel) + ' ' + (sreq ? sreq.outerHTML : '');
    }
  };

  AddressBlock.prototype.applyPostcodeRules = function (c) {
    var cfg = this.cfg;
    if (this.postcode) {
      this.postcode.disabled = false;
      this.postcode.setAttribute('placeholder', c.pcPh || '');
      this.postcode.setAttribute('data-pattern', c.pcRe || '');
      this.postcode.setAttribute('data-pc-label', c.pcLabel || 'Postal code');
      this.postcode.setAttribute('data-required', c.pcReq ? '1' : '0');
      this.postcode.value = '';
      this.postcode.removeAttribute('aria-invalid');
      var errBox = document.getElementById('err-' + cfg.postcodeId);
      if (errBox) { errBox.textContent = ''; errBox.classList.remove('show'); }
    }

    if (this.pcLabel) {
      var req = this.pcLabel.querySelector('.fx-shp__req, .fxp__req');
      var keep = req ? req.outerHTML : '';
      this.pcLabel.innerHTML = esc(c.pcLabel) + ' ' + keep;
    }

    if (this.pcFmt) {
      if (c.pcHint) {
        this.pcFmt.textContent = c.pcHint;
        this.pcFmt.hidden = false;
      } else {
        this.pcFmt.hidden = true;
      }
    }
  };

  AddressBlock.prototype.pointLabelAt = function (id) {
    var lbl = document.querySelector('label[for="' + this.cfg.stateSelectId + '"],' +
                                    'label[for="' + this.cfg.stateTextId + '"]');
    if (lbl) lbl.setAttribute('for', id);
  };

  AddressBlock.prototype.checkPostcode = function (live) {
    if (!this.postcode) return true;
    var input = this.postcode;
    var val = (input.value || '').trim();
    var re = input.getAttribute('data-pattern');
    var required = input.getAttribute('data-required') !== '0';
    var label = input.getAttribute('data-pc-label') || 'Postal code';
    var msg = '';

    if (!val) {
      if (required) msg = 'Enter a ' + label.toLowerCase() + '.';
    } else if (re) {
      var rx;
      try { rx = new RegExp(re, 'i'); } catch (e) { rx = null; }
      if (rx && !rx.test(val)) {
        msg = 'That does not look like a valid ' + label.toLowerCase() + ' for this country.';
      }
    }

    var errBox = document.getElementById('err-' + this.cfg.postcodeId);
    if (msg) {
      if (!live) {
        input.setAttribute('aria-invalid', 'true');
        if (errBox) { errBox.textContent = msg; errBox.classList.add('show'); }
      } else if (input.getAttribute('aria-invalid') === 'true') {
        if (errBox) { errBox.textContent = msg; errBox.classList.add('show'); }
      }
      return false;
    }
    input.removeAttribute('aria-invalid');
    if (errBox) { errBox.textContent = ''; errBox.classList.remove('show'); }
    return true;
  };

  AddressBlock.prototype.validateState = function () {
    if (!this.stateSelect) return true;
    var needed = this.subs.length > 0;
    var node = needed ? this.stateSelect : this.stateText;
    var ok = !needed || !!node.value;
    var errBox = document.getElementById(this.cfg.stateErrorId);
    if (!ok) {
      node.setAttribute('aria-invalid', 'true');
      if (errBox) {
        errBox.textContent = 'Choose a ' + (this.cfg.stateWord || 'state') + '.';
        errBox.classList.add('show');
      }
    } else {
      node.removeAttribute('aria-invalid');
      if (errBox) { errBox.textContent = ''; errBox.classList.remove('show'); }
    }
    return ok;
  };

  AddressBlock.prototype.values = function () {
    var sub = this.stateSelect && !this.stateSelect.hidden
      ? this.stateSelect.value
      : (this.stateText ? this.stateText.value : '');
    var subName = sub;
    if (this.stateSelect && !this.stateSelect.hidden && this.stateSelect.value) {
      var opt = this.stateSelect.options[this.stateSelect.selectedIndex];
      subName = opt ? opt.textContent : sub;
    }
    return {
      country: this.country.value,
      countryName: this.country.value && BY_CODE[this.country.value] ? BY_CODE[this.country.value].name : '',
      state: sub,
      stateName: subName,
      postcode: this.postcode ? (this.postcode.value || '').trim() : ''
    };
  };

  AddressBlock.prototype.reset = function () {
    this.country.reset();
    if (this.stateSelect) {
      this.stateSelect.innerHTML = '<option value="">Select a country first</option>';
      this.stateSelect.disabled = true;
      this.stateSelect.classList.remove('fxa__state--filled');
    }
    if (this.stateText) { this.stateText.value = ''; this.stateText.hidden = true; this.stateText.disabled = true; }
    if (this.postcode) {
      this.postcode.value = '';
      this.postcode.disabled = true;
      this.postcode.removeAttribute('aria-invalid');
      this.postcode.setAttribute('placeholder', 'Select a country first');
    }
    this.applyCountry(null, true, true);
  };

  /* ---------------------------------------------------------------------
     Public API
     --------------------------------------------------------------------- */
  window.FXAddress = {
    get countries() { return DATA ? DATA.countries : []; },
    byCode: BY_CODE,
    CountryPicker: CountryPicker,
    AddressBlock: AddressBlock,
    ensureCountries: ensureCountries,
    subdivisions: function (cc) { return subsCache[cc] || []; },
    postalRule: function (cc) {
      var c = BY_CODE[cc];
      return c ? { label: c.pcLabel, pattern: c.pcRe, placeholder: c.pcPh, required: c.pcReq } : null;
    }
  };
})();
