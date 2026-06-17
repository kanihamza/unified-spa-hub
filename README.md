# Unified SPA Hub — DGO Digital Operations Hub

A **dependency-free, multi-file, multi-folder, multi-module HTML platform** for NITDA
digital operations. It integrates exclusively with **Microsoft Power Automate
HTTP-triggered flows**. There is **no framework (no React), no build tool (no Vite),
no proxy, no intermediary, and no runtime dependencies** — every page is plain HTML,
CSS custom properties, and vanilla JavaScript that runs directly in the browser.

## Running locally

No install or build step is required. Serve the folder with any static file server:

```bash
npm start            # python3 -m http.server 3000
# or
python3 -m http.server 3000
# or any equivalent static server, then open http://localhost:3000
```

> Pages reference shared scripts and assets with **relative paths** (e.g. `js/api.js`), so the
> platform also works when served from a sub-path (project sites, reverse-proxy subfolders).

## Architecture

- **Pages** (`*.html`) — one file per module (dashboard, docs, tasks, emails, assignment,
  reports, hubs, settings, etc.). Each page links the shared CSS token layers and the
  shared service scripts, then runs a small page-specific module.
- **Shared services** (`js/`) — centralized, loaded on every page via `window.*`:
  - `api.js` — **the single source of truth for all flow endpoints** (`FLOW_ENDPOINTS`),
    the `callPA(code, payload)` gateway, and the offline **Outbox** with retry/backoff.
  - `state.js` — session identity, theme, and density persistence.
  - `identity.js` — OTP gateway (currently disabled — see `GOVERNANCE.md`).
  - `lookups.js` — reference-data cache (departments, officers, categories) via flow `E01`.
  - `sanitizer.js`, `a11y.js`, `telemetry.js`, `chrome.js` — shared utilities and shell.
- **Design system** (`css/dgo-*.css`) — primitive → semantic → theme/density tokens.

### Integration model

The frontend calls Power Automate flows directly (current phase — no proxy). Every flow
URL lives **only** in `js/api.js`; no module defines its own endpoint. Resolution order
for a flow code is: per-flow runtime override (Settings → localStorage `dgo_endpoint_<code>`)
→ central `FLOW_ENDPOINTS` default. A flow with an empty URL is treated as *unprovisioned*:
read flows return a genuine **empty state** (there is no simulation/sample fallback — live-only),
and write flows stay queued in the Outbox (moving to a dead-letter store after retries) until a
real URL is supplied.

**Response normalization.** `callPA` normalizes every read response to the platform's canonical
shape, so all pages work against the live flow contract regardless of envelope or field casing.
Live flows return `{ok,…,docs|tasks|emails:[{ID,Title,AssignmentStatus,…}]}`; the gateway
unwraps the array (exposing both `records` and the entity key) and adds camelCase aliases
(`id`,`title`,`status`,…) while preserving the original PascalCase fields.

**Live-only.** There is no demo/sample/mock data anywhere. The platform calls the live flows directly;
when a flow returns nothing or is unreachable, pages show genuine empty/error states. Live data
requires the flows to permit the app origin via **CORS** (a server-side flow config).

**Startup fetch-all + loading screen.** On app start (once per browser session) a non-navigable
**loading screen** is shown while a single **Fetch-All** loads docs, tasks, emails and references
(users / departments / categories) in one pass and caches them. If the Fetch-All flow URL (`E00`) is
configured (Settings → "E00 — Fetch-All"), it's one call; otherwise the platform fans out to the
dedicated read flows. The overlay clears when data is ready.

**Fetch & cache strategy.** The **Fetch-All is the single source of truth** — docs, tasks, emails and
references are all subsets of it. Modules **never** fetch their own flow: on load (or becoming visible)
they only **read the cache** (`dgo_cache_<code>` / `dgo_cached_lookups`) populated by the Fetch-All —
there is no auto-refresh and no per-module fetch running alongside the Fetch-All. Cached primary data
persists across navigation. The dedicated read flows (E01/E02/E04/E09) are only used as the startup
**fallback** when `E00` isn't configured. **Refresh** (the global topbar **Refresh** button on every
module/home, plus the in-module refresh buttons) re-runs the single Fetch-All and re-renders — it never
triggers a dedicated subset flow. A write to a flow also marks the related cache stale for the next
refresh.

**References load once** on startup (they're mostly static). A manual references refresh re-runs the
Fetch-All and is only exposed via Settings / diagnostics (Settings → "Rebuild Lookup cache"), not as a
per-module button. `API.clearCache()` (Settings → "Flush offline cache") drops cached reads.

| Code | Purpose | Provisioned |
|------|---------|-------------|
| E01 | Reference / lookup directory | ✅ |
| E02 | Inbound dossiers (OData) | ✅ |
| E04 | Action tasks (OData) | ✅ |
| E09 | Mailbox sync (OData) | ✅ |
| E03, E05 | Update dossier status / task progress / acknowledge (Subsidiary Doc Actions) | ✅ |
| E06 | Single task assignment (Create Task) | ✅ |
| E07 | Uniform bulk broadcast | ✅ |
| E08 | AI batch allocator | ✅ |
| E10 | Email-to-task directive | ✅ |
| E14 | Dynamic Multi-Actions (catch-all; correspondence writes) | ✅ |
| E16, E17 | OTP request / verify | ✅ provisioned (OTP disabled this phase — FR-036 / EXC-01) |

> `E15` from the prior source matrix was a phantom (no source flow) and is intentionally not declared.

## Governance

Two governed exceptions apply to the current phase and are tracked in
[`GOVERNANCE.md`](GOVERNANCE.md):

1. **Embedded flow URLs** — flow trigger URLs (with SAS signatures) are embedded in the
   frontend by design until a proxy layer is approved. Treat them as exposed secrets and
   rotate as documented.
2. **OTP disabled this phase** — `OTP_SECURITY_ACTIVE = false` in `js/identity.js`, a tracked
   exception per FR-036. The gateway and admin-bypass logic remain in place for re-enablement at
   closure. Identity is selected from the live officer directory (no hardcoded user) — see EXC-01.

## Compliance & CI

This platform is vanilla **HTML5 / CSS3 / ES6+** with **no build step**. The following are
**absent from the codebase and actively blocked** by the compliance lint
([`test/compliance-lint.mjs`](test/compliance-lint.mjs)), which runs in CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) on every push and pull request:

- **React** — no `react` / `react-dom` dependency, no `React.*` / `createRoot` usage.
- **Vite** and other bundlers — no `vite` / `@vitejs/*` dependency, no `vite.config.*` /
  `webpack.config.*` / `rollup.config.*`.
- **JSX / TSX** — no `.jsx` / `.tsx` source files.
- **TypeScript build config** — no `tsconfig*.json`.
- **Runtime / build dependencies** — `package.json` declares **no** `dependencies`; the only
  dev-dependency is Playwright, used solely by the real-browser smoke test.

The lint also enforces the platform's structural rules: relative script paths, flow endpoints
defined only in `js/api.js`, no hardcoded identities, no demo/simulation scaffolding, no
script-enabled iframes, and a Content-Security-Policy on every page.

```bash
npm run lint     # compliance lint (no dependencies needed)
npm run smoke    # real-browser smoke (installs Playwright + Chromium)
npm test         # both gates
```
