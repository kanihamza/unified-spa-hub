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

> Pages reference shared scripts with root-absolute paths (e.g. `/js/api.js`), so the
> server must be rooted at the project directory.

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
read flows fall back to deterministic local simulation, and write flows stay queued in the
Outbox until a real URL is supplied.

**Response normalization.** `callPA` normalizes every read response to the platform's canonical
shape, so all pages work against the live flow contract regardless of envelope or field casing.
Live flows return `{ok,…,docs|tasks|emails:[{ID,Title,AssignmentStatus,…}]}`; the gateway
unwraps the array (exposing both `records` and the entity key) and adds camelCase aliases
(`id`,`title`,`status`,…) while preserving the original PascalCase fields.

**Live-only.** There is no demo/sample/mock data anywhere. The platform calls the live flows directly;
when a flow returns nothing or is unreachable, pages show genuine empty/error states. Live data
requires the flows to permit the app origin via **CORS** (a server-side flow config).

**Fetch & cache strategy.** Read data is fetched **once** (on first need / app start) and cached in
`localStorage` per flow (`dgo_cache_<code>`). Navigating to or landing on a module **does not refetch** —
it reads the cache. Data refreshes only on an explicit trigger: a **write** to a related flow
(auto-invalidates the affected module's cache, so its next read is fresh) or a **manual refresh button**
(`API.refresh(code)` / `callPA(code, payload, { force: true })`) — e.g. AID "Sync Registry", the
tracker "Force Sync", and the Fast-Track toolbar actions. Each module refreshes via its own dedicated
flow. `API.clearCache()` (Settings → "Flush offline cache") drops all cached reads.

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
| E14, E15 | Reserved | ⛔ no flow assigned |
| E16, E17 | OTP request / verify | ✅ provisioned (OTP disabled this phase — FR-036 / EXC-01) |

## Governance

Two governed exceptions apply to the current phase and are tracked in
[`GOVERNANCE.md`](GOVERNANCE.md):

1. **Embedded flow URLs** — flow trigger URLs (with SAS signatures) are embedded in the
   frontend by design until a proxy layer is approved. Treat them as exposed secrets and
   rotate as documented.
2. **OTP disabled this phase** — `OTP_SECURITY_ACTIVE = false` in `js/identity.js`, a tracked
   exception per FR-036. The gateway and admin-bypass logic remain in place for re-enablement at
   closure. Identity is selected from the live officer directory (no hardcoded user) — see EXC-01.
