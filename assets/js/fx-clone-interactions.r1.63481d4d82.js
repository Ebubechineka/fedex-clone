/* ==========================================================================
   fx-clone-interactions.r1.js
   Repairs the interactive controls that the static clone left dead.
   Loaded last, after FedEx's own bundles and the tracking/shipment features.
   Nothing here changes the visual design: it only wires behaviour that the
   original site's (absent) scripts used to provide.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var nav = doc.querySelector('.fxg-nav');

  /* ------------------------------------------------------------------
     0. Guard: the footer country link calls FDX.SESSION.removeRedirectCookie()
        inline. FDX.SESSION does not exist in the clone, so the click threw
        "Cannot read properties of undefined". Provide a no-op.
     ------------------------------------------------------------------ */
  function guardSession() {
    if (window.FDX && !window.FDX.SESSION) {
      window.FDX.SESSION = { removeRedirectCookie: function () {} };
    }
  }
  guardSession();

  /* ------------------------------------------------------------------
     1. Mobile hamburger — opens / closes the global nav
     ------------------------------------------------------------------ */
  function wireHamburger() {
    var btn = doc.getElementById('fxg-mobile-menu-btn');
    if (!btn || !nav || btn.dataset.fxWired === '1') return;
    btn.dataset.fxWired = '1';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'fxg-global-nav');

    var dd = doc.querySelector('.fxg-dropdown.fxg-global-nav');
    if (dd && !dd.id) dd.id = 'fxg-global-nav';

    function setOpen(open) {
      nav.classList.toggle('fxg-nav--mobile-menu-open', open);
      btn.classList.toggle('is-active', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close Menu' : 'Hamburger Menu');
      doc.body.classList.toggle('fx-menu-open', open);
    }

    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      setOpen(!nav.classList.contains('fxg-nav--mobile-menu-open'));
    });

    // Close after following a link inside the menu
    nav.addEventListener('click', function (ev) {
      var a = ev.target.closest && ev.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (href && href !== '#' && !/^javascript:/i.test(href)) setOpen(false);
    });

    doc.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && nav.classList.contains('fxg-nav--mobile-menu-open')) {
        setOpen(false);
        btn.focus();
      }
    });

    // Leaving mobile width resets the state
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024) setOpen(false);
    });
  }

  /* ------------------------------------------------------------------
     2. "Sign Up or Log In" utility dropdown
        The clone's dropdown wiring only looks at .fxg-dropdown__list items,
        so this wrapper never received the --open class its CSS expects.
     ------------------------------------------------------------------ */
  function wireSignIn() {
    var wrap = doc.getElementById('global-login-wrapper');
    if (!wrap || wrap.dataset.fxWired === '1') return;
    wrap.dataset.fxWired = '1';
    var trigger = wrap.querySelector('#fxg-dropdown-signIn');
    if (!trigger) return;
    trigger.setAttribute('aria-expanded', 'false');

    var pinned = false;

    function setOpen(open) {
      wrap.classList.toggle('fxg-dropdown__item--open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) pinned = false;
    }

    /* Hover opens the panel but does not pin it. A click pins it open, and a
       second click closes it. Without the pin flag, the mouseenter that
       precedes every click would open the panel and the click would
       immediately close it again. */
    trigger.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (pinned) {
        setOpen(false);
      } else {
        setOpen(true);
        pinned = true;
      }
    });
    wrap.addEventListener('mouseenter', function () {
      if (!pinned) setOpen(true);
    });
    wrap.addEventListener('mouseleave', function () {
      if (!pinned) setOpen(false);
    });
    doc.addEventListener('click', function (ev) {
      if (!wrap.contains(ev.target)) setOpen(false);
    });
    doc.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') setOpen(false);
    });
  }

  /* ------------------------------------------------------------------
     3. Header search icon
     ------------------------------------------------------------------ */
  function wireSearch() {
    var btnWrap = doc.querySelector('.fxg-user-options__search-btn');
    if (!btnWrap || !nav || btnWrap.dataset.fxWired === '1') return;
    btnWrap.dataset.fxWired = '1';
    var link = btnWrap.querySelector('a');
    if (!link) return;
    link.setAttribute('role', 'button');
    link.setAttribute('aria-label', 'Search');
    link.setAttribute('aria-expanded', 'false');

    function setOpen(open) {
      nav.classList.toggle('fxg-nav--search-open', open);
      link.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        var input = doc.querySelector('.fxg-user-options__search input[type="text"], .fxg-user-options__search input[type="search"]');
        if (input) setTimeout(function () { input.focus(); }, 60);
      }
    }

    link.addEventListener('click', function (ev) {
      ev.preventDefault();
      setOpen(!nav.classList.contains('fxg-nav--search-open'));
    });
    doc.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') setOpen(false);
    });
  }

  /* ------------------------------------------------------------------
     4. Hero cube tabs (RATE & SHIP / TRACK / LOCATIONS)
        The clone ships the markup and the .fxg-cube--active /
        .fxg-app--active CSS, but no script to switch them.
     ------------------------------------------------------------------ */
  function wireCubes() {
    var cubes = [].slice.call(doc.querySelectorAll('.fxg-cube'));
    if (!cubes.length) return;

    function panelFor(cube) {
      return doc.getElementById(cube.id + '-tab');
    }

    function activate(cube) {
      cubes.forEach(function (c) {
        c.classList.toggle('fxg-cube--active', c === cube);
        c.setAttribute('aria-selected', c === cube ? 'true' : 'false');
      });
      cubes.forEach(function (c) {
        var p = panelFor(c);
        if (!p) return;
        var on = c === cube;
        p.classList.toggle('fxg-app--active', on);
        p.classList.toggle('fxg-app--active-desktop', on);
        p.hidden = !on;
        p.setAttribute('aria-hidden', on ? 'false' : 'true');
      });
      fillEmptyPanel(cube);
    }

    /* RATE & SHIP's panel is an empty mount point for FedEx's rate app,
       which is not part of the clone. Point it at the real page instead of
       leaving a blank box. */
    function fillEmptyPanel(cube) {
      var p = panelFor(cube);
      if (!p) return;
      var body = p.querySelector('.fxg-app__form-wrapper') || p;
      if (body.dataset.fxFilled === '1') return;
      if (body.textContent.trim().length > 0) return;
      body.dataset.fxFilled = '1';
      body.innerHTML =
        '<div class="fx-cube-cta">' +
          '<p class="fx-cube-cta__lead">Get a rate and create a shipping label.</p>' +
          '<a class="fx-cube-cta__btn" href="create-shipment.html">Create a shipment</a>' +
        '</div>';
    }

    cubes.forEach(function (cube) {
      var btn = cube.querySelector('button');
      if (!btn) return;
      cube.setAttribute('aria-selected', cube.classList.contains('fxg-cube--active') ? 'true' : 'false');
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        activate(cube);
      });
      cube.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          activate(cube);
        }
      });
    });

    // Sync the initial state so the visible panel matches the active cube.
    var initial = cubes.filter(function (c) { return c.classList.contains('fxg-cube--active'); })[0] || cubes[0];
    activate(initial);
  }

  /* ------------------------------------------------------------------
     5. "Skip to main content"
     ------------------------------------------------------------------ */
  function wireSkip() {
    var skip = doc.querySelector('.fxg-skip-to-main-content');
    if (!skip || skip.dataset.fxWired === '1') return;
    skip.dataset.fxWired = '1';
    skip.setAttribute('href', '#fx-main');
    var main = doc.querySelector('.fxg-main-content');
    if (main && !main.id) main.id = 'fx-main';
    skip.addEventListener('click', function (ev) {
      ev.preventDefault();
      var target = doc.getElementById('fx-main');
      if (!target) return;
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  /* ------------------------------------------------------------------
     6. "Cookie Consent" — the clone has no OneTrust module, so send the
        visitor to the real privacy centre rather than a dead "#".
     ------------------------------------------------------------------ */
  function wireCookieConsent() {
    var links = [].slice.call(doc.querySelectorAll('a'));
    links.forEach(function (a) {
      if (!/^\s*cookie consent\s*$/i.test(a.textContent || '')) return;
      if (a.dataset.fxWired === '1') return;
      a.dataset.fxWired = '1';
      a.setAttribute('href', 'legal-privacy.html');
      // The clone has no OneTrust module, so point at the local privacy
      // policy instead of the live FedEx centre.
      a.removeAttribute('target');
      a.removeAttribute('rel');
    });
  }

  /* ------------------------------------------------------------------
     7. Create Shipment: the fixed header overlays the breadcrumb.
        Push the page content below the header's real height.
     ------------------------------------------------------------------ */
  function fixHeaderOffset() {
    var main = doc.querySelector('.fxg-main-content');
    var header = doc.querySelector('header');
    if (!main || !header) return;
    // The homepage hero already accounts for the fixed header; every other
    // page (Create Shipment and the .fxp secondary pages) needs the offset.
    if (!doc.querySelector('.fx-shp') && !doc.querySelector('.fxp')) return;

    function apply() {
      var h = Math.round(header.getBoundingClientRect().height);
      if (h > 0) main.style.paddingTop = h + 'px';
    }
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('load', apply);
  }

  /* ------------------------------------------------------------------
     8. Create Shipment: the printable label must be a direct child of
        <body>, because the print stylesheet hides `body > *`.
     ------------------------------------------------------------------ */
  function hoistLabel() {
    var label = doc.getElementById('shp-label');
    if (!label || label.parentElement === doc.body) return;
    doc.body.appendChild(label);
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  function boot() {
    guardSession();
    wireHamburger();
    wireSignIn();
    wireSearch();
    wireCubes();
    wireSkip();
    wireCookieConsent();
    fixHeaderOffset();
    hoistLabel();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  // Re-run once everything (including the feature scripts) has settled.
  window.addEventListener('load', function () {
    guardSession();
    wireCubes();
    hoistLabel();
    fixHeaderOffset();
  });
})();
