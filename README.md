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

| Code | Purpose | Provisioned |
|------|---------|-------------|
| E01 | Reference / lookup directory | ✅ |
| E02 | Inbound dossiers (OData) | ✅ |
| E04 | Action tasks (OData) | ✅ |
| E09 | Mailbox sync (OData) | ✅ |
| E03, E05–E08, E10, E14, E15 | Write / action flows | ⛔ provision via Settings |
| E16, E17 | OTP request / verify | ⛔ OTP disabled this phase |

## Governance

Two governed exceptions apply to the current phase and are tracked in
[`GOVERNANCE.md`](GOVERNANCE.md):

1. **Embedded flow URLs** — flow trigger URLs (with SAS signatures) are embedded in the
   frontend by design until a proxy layer is approved. Treat them as exposed secrets and
   rotate as documented.
2. **OTP gateway disabled** — `OTP_SECURITY_ACTIVE = false` in `js/identity.js`, tracked
   for re-enablement before final security closure.
