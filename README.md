# FedEx Clone — static site (v12, performance build)

A self-contained static clone of the FedEx US homepage and its supporting pages.
No build step, no server, no external requests. Upload the contents of this
folder to any static host and it works.

---

## Deploy to GitHub Pages

1. Create a new **public** repository, e.g. `fedex-clone`.
2. Upload **the contents of this folder** so that `index.html` sits at the
   repository root — not inside a subfolder.
   - Web UI: **Add file → Upload files**, then drag everything in.
   - Or from a terminal:
     ```bash
     cd fedex-clone
     git init && git add . && git commit -m "FedEx clone"
     git branch -M main
     git remote add origin https://github.com/YOUR-USERNAME/fedex-clone.git
     git push -u origin main
     ```
3. Open **Settings → Pages**.
4. Under **Build and deployment**:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main`
   - **Folder:** `/ (root)`
   - Click **Save**.
5. Wait 1–2 minutes, then open:

   ```
   https://YOUR-USERNAME.github.io/fedex-clone/
   ```

A 404 immediately after saving is normal — GitHub is still building. Refresh.

All paths are relative, so the site works identically at a domain root or in a
subfolder like `/fedex-clone/`.

---

## Pages

| File | What it does |
|---|---|
| `index.html` | Homepage — hero, tracking widget, service tiles, promo grid |
| `create-shipment.html` | Shipment form → reference number, barcode, QR, printable label |
| `tracking.html` | Tracking number → status timeline with scan events |
| `rates.html` | Origin/destination/weight/dimensions → priced service options |
| `locations.html` | Searchable, filterable drop-off point list |
| `pickup.html` | Pickup booking with date/time picker and confirmation |
| `support.html` | FAQ accordion + validated contact form |
| `services.html` | Service overview and comparison table |
| `about.html` | Company information |
| `careers.html` | Job listings and hiring process |
| `signup-login.html` | Tabbed log in / sign up with a demo signed-in state |
| `sitemap.html` | Full page index |
| `newsroom.html` | News listing |
| `legal-terms.html` | Terms of use (placeholder legal copy) |
| `legal-privacy.html` | Privacy notice |
| `legal-cookies.html` | Cookie notice |
| `legal-accessibility.html` | Accessibility statement |
| `404.html` | Not-found page |

---

## Performance notes (v12)

This build was optimised against a Fast 3G and Slow 4G profile. What changed
versus v11:

- **Removed 2.0 MB of dead vendor JavaScript.** `j11-clientlib-dependencies`
  (jQuery UI + Adobe DIL + AEM shared, 993 KB) and `j1-gdl-fedex` (963 KB) were
  loaded on every page and used by nothing. No jQuery UI widget is referenced
  anywhere in the markup or the site's own scripts.
- **Removed 8 more unused vendor scripts** (`j2`, `j3`, `j5`, `j6`, `j7`, `j8`,
  `j9`, `j10`, `j12`) — AEM/Granite/Kaltura/analytics plumbing with no consumer.
- **Country data is now lazy and split.** The 226 KB combined dataset became a
  61 KB country index fetched the first time a country dropdown is opened, plus
  one small chunk per country fetched only when that country is chosen.
- **Images converted to WebP** with the original JPEG kept as a `<picture>`
  fallback. Below-the-fold images are `loading="lazy"`.
- **All scripts deferred**, so HTML parsing is never blocked.
- **Two small stylesheets inlined** (`c1-site`, `fx-notice`) to remove two
  round-trips from the critical path.
- **Content-hashed filenames** for the CSS/JS that change rarely, so they can be
  cached indefinitely.
- **Unused vendor files deleted** from the package (they were never requested).

### Measured results

Throttled Chromium, 4× CPU slowdown, gzip enabled.

| Page | Profile | Viewport | Before (v11) | After (v12) |
|---|---|---|---|---|
| index | Fast 3G | desktop | 1,352 KB / 44 req / 6,957 ms DCL | **690 KB / 30 req / 1,826 ms** |
| index | Fast 3G | mobile | 1,061 KB / 40 req / 5,612 ms DCL | **505 KB / 26 req / 1,722 ms** |
| index | Slow 4G | desktop | 1,352 KB / 44 req / 4,015 ms DCL | **690 KB / 30 req / 1,226 ms** |
| index | Slow 4G | mobile | 1,061 KB / 40 req / 3,393 ms DCL | **505 KB / 26 req / 957 ms** |
| create-shipment | Fast 3G | desktop | 1,020 KB / 34 req / 4,752 ms DCL | **417 KB / 23 req / 1,509 ms** |
| create-shipment | Fast 3G | mobile | 1,020 KB / 34 req / 4,592 ms DCL | **417 KB / 23 req / 1,451 ms** |
| create-shipment | Slow 4G | desktop | 1,020 KB / 34 req / 3,043 ms DCL | **386 KB / 23 req / 746 ms** |
| create-shipment | Slow 4G | mobile | 1,020 KB / 34 req / 3,093 ms DCL | **417 KB / 23 req / 711 ms** |

---

## Country → State/Region → Postcode cascade

`create-shipment.html` and `pickup.html` carry a three-level address cascade.

- **Country** is the first field in every address block. It is a searchable
  combobox over all **249 ISO 3166-1 countries**, each with its flag and code.
  Type to filter; matches names, ISO codes and common aliases (`UK`, `USA`,
  `Holland`, `Naija`).
- **State/Region** repopulates from the chosen country's real subdivisions —
  56 for the US (50 states + DC + 5 territories), 37 for Nigeria (36 + FCT),
  221 for the UK, 13 for Canada, 36 for India, and so on. Countries with no
  fixed subdivision list fall back to a free-text input.
- **Postcode** adapts its label, placeholder and validation pattern per country
  (US ZIP `94105` / `94105-1234`, UK `SW1A 1AA`, Nigeria 6 digits, Canada
  `K1A 0B1`, India 6-digit PIN, Brazil `01310-100`).
- State and Postcode stay **disabled until a country is chosen**, with a visible
  hint explaining why.

Data lives in `assets/js/geo/` and is loaded on demand — nothing is fetched from
a third party, and there is no API key.

---

## Configuration

Demo mode is on by default: tracking and shipment pages generate sample data
locally. To use a real tracking API, open the tracking feature script in
`assets/js/` and set `apiKey` or `proxyUrl` in the `FX_TRACKING_CONFIG` block at
the top. Leave both empty to stay in demo mode.

---

## Notes

- This is a **demonstration clone**, not affiliated with FedEx. All trademarks
  belong to their owners.
- There are **no external links** anywhere in the build. Social icons and other
  items with no local equivalent open an in-page notice instead of navigating
  away.
- No API keys, tokens or secrets are present in any file.
- All filenames are lowercase, so the site is safe on case-sensitive hosts
  (GitHub Pages, Linux servers).
