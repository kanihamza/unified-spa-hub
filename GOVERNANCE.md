# Delivery Governance — Tracked Exceptions & Limitations

**Platform:** Unified SPA Hub (DGO Digital Operations Hub)
**Baseline:** Dependency-Free HTML Multi-Module Platform with Power Automate HTTP Flow Integration (BRD/FRD v1.0)
**Last updated:** 2026-06-18

> **Remediation round 2 (2026-06-18) — Architecture & Structural Audit findings.** Implemented
> against the 21-finding audit, strictly within the BRD/FRD (dependency-free, native vanilla JS,
> Power Automate flows as the sole integration, no proxy/intermediary, OTP kept disabled per
> FR-036). In-repo (R) changes are verified by `npm test` (compliance lint + 21 headless unit
> assertions + real-browser smoke). Cross-boundary (F) items live in the flows and are tracked
> below. Summary:
> - **STR-01/SEC-03:** single canonical output-encoder (`Sanitizer.escapeHtml`); the three
>   duplicate `escapeHtml` re-implementations removed. CI lint `LOCAL_ESCAPER` prevents regression.
> - **INT-01:** `Outbox.process()` is single-flight (no double-delivery under concurrent triggers);
>   `X-DGO-Tx-ID` idempotency key sent on every write (flows MUST dedupe — see below).
> - **REL-01:** outbox write has a 20s `AbortController` timeout; a successful boot emits
>   `dgo:data-refreshed` so cold-cache renders recover in place.
> - **DATA-01:** `safeSetItem()` evicts-and-retries on quota pressure and surfaces a persistent
>   failure via `dgo:storage-error` + telemetry — the prior silent `catch{}` is gone.
> - **DATA-02 / EXC-01 closure item:** one canonical session shape, written only through `State`;
>   Identity owns only the token; expiry honored consistently.
> - **INF-01:** environment profiles (dev/test/prod) resolved centrally by host or a Settings
>   profile (`dgo_env_profile`); non-prod inherit prod until ops populate their own rotated URLs.
> - **STR-03:** pages use public APIs (`Outbox.clearQueue`, `Lookups.clearCache`); CI lint
>   `PRIVATE_KEY_IN_HTML` blocks reaching into another module's storage key.
> - **INT-02/GOV-01:** E02 resolved to `7995c1eb…` in code AND `ENDPOINT_MAP.md`; `FLOW_CONTRACTS.md`
>   added; CI lint `ENDPOINT_MAP_DRIFT` fails the build on doc/code GUID divergence.
> - **ARC-02 (done):** all 15 pages' inline page logic externalized to `js/pages/*.js` (no more
>   per-page inline monoliths); the compliance lint scans them.
> - **SEC-03 CSP lockdown (done):** all inline `<script>` blocks and all 96 inline event handlers
>   removed (central `data-act` dispatcher in `chrome.js`); `script-src` dropped to `'self'` and
>   `connect-src` narrowed to the Power Platform flow hosts on all 19 pages. CI lint enforces it
>   (`INLINE_HANDLER`, `INLINE_SCRIPT`, `CSP_UNSAFE_INLINE_SCRIPT`, `CSP_CONNECT_WILDCARD`).
> - **STR-02 (done):** the `response-*` nav/palette labels disambiguated; `ack.html` documented as an
>   intentional deep-link page.
>
> **Remaining in-repo follow-ups (tracked, not regressions):**
> - **SEC-03 style-src:** `style-src` still allows `'unsafe-inline'` — inline `style=""` attributes and
>   one `<style>` block (`registry-movement`) remain. The inline-style→token-class sweep is the next
>   step to drop it; lower risk than script-src, which is now closed.
> - **ARC-01 (native ESM):** shared modules still coordinate via `window.*` globals (a valid
>   dependency-free pattern); converting to native `import`/`export` for fully deterministic init is a
>   follow-up. Load order is already guarded (DOMContentLoaded) and externalized page modules reduced
>   the coupling surface.
> - **REL-02 client sink:** the optional telemetry-to-flow sink (`E18`) and connectivity indicator are
>   specified (flow-side below) but the client emitter is not yet wired.
>
> **Frontend (R) verification this round:** `npm test` = compliance lint (13 rule groups) +
> 21 headless unit assertions + 38 real-browser smoke checks (all 19 pages load clean; flow calls
> succeed under the tightened CSP; the data-act dispatcher fires). All green.

> **Audit remediation (2026-06-17) — in-repo phases P0–P4 complete.** Implemented against the
> Architecture & Structural Audit. Summary:
> - **DEP-01:** all script `src` are relative (`js/…`), so the app loads on non-root hosts.
> - **SEC-03 (completed):** added `Sanitizer.safeUrl()` (scheme allowlist + attribute encoding)
>   and applied it to the previously-unescaped doc-link sinks (`response-tracking`, `fast-track`
>   `AttachmentLink`, `CC`); email bodies now render via `Sanitizer.cleanHTML()` instead of the
>   fragile iframe `srcdoc`. A runtime XSS-regression test guards this. (Supersedes the residual
>   "not yet `javascript:`-scheme filtered" note below.)
> - **REL-01:** startup Fetch-All retries on failure (no stranded empty session) and shows a
>   dismissible Retry banner; `API.getBootState()` exposed.
> - **INT-01:** writes are confirmed on delivery, not on enqueue (`dgo:outbox-delivered` /
>   `dgo:outbox-failed`); exhausted writes go to a dead-letter store with retry/discard in Settings.
> - **DATA-01:** removed all hardcoded role emails; identity is sourced only from `State`/`Identity`.
> - **STR-01:** `fast-track` is registered in the shared navigation/command palette (no longer an
>   orphaned micro-app) and uses the shared identity.
> - **DATA-02:** category cascade is data-driven from live E01 records.
> - **SEC-02:** admin-bypass requires a token-backed session (still inert while OTP is disabled).
> - **OBS-01:** a conservative CSP ships on every page; telemetry tolerates a corrupted store.
> - **CFG-01:** Settings exposes every flow override (incl. E14/E16/E17); "Restore Defaults" works.
> - **GOV-02:** CI (`.github/workflows/ci.yml`) runs a compliance lint (BRD §13 controls) + the
>   real-browser smoke (18/18 green).
> - **STR-02 (migrated on branch `claude/str02-design-token-migration`, pending visual QA):**
>   module CSS (`exec-hub`, `dgceo-hub`, `response-tracking`, `response-matrix`, `fast-track`)
>   now aliases the central `dgo-tokens.css` palette. NITDA teal/gold were added as exact brand
>   tokens, so the default light theme is visually unchanged while the modules now follow the
>   shared light/dark/HC themes. See `docs/STR-02-CSS-MIGRATION.md` for the mapping and the
>   visual-QA checklist. Residual: generic neutrals in the two literal-driven modules and the
>   `response-matrix` Tailwind-shim coverage remain a follow-up.
> - **Cross-boundary (server-side, not in this repo):** rotate the committed SAS signatures (SEC-01),
>   enforce OTP/role **inside the flows** (SEC-01/02 closure), and set each flow's
>   `Access-Control-Allow-Origin` to the real app origin (REL-01 / the CORS item below).

> **Security hardening (2026-06-16):** Output-encoding remediation applied across the
> client. All dynamic external data rendered into `innerHTML` now passes through
> `Sanitizer.escape()` (shared shell `chrome.js`, plus the page-inline render scripts on
> index/docs/tasks/emails/lookup/assign/bulk-assign/registry-movement/response-track/settings).
> This closes the stored-XSS gap (audit SEC-03) affecting NFR-006/007/008 and AC-011.
> Residual low-risk items: CSS class interpolations of backend enum values
> (`status`/`priority`), and `href`/`src` URL values (escaped for attribute breakout but not
> yet `javascript:`-scheme filtered).

> **Live-only build (2026-06-16, corrected):** ALL demo/simulation/sample/seed/mock data and the
> demo-mode toggle were **removed** (FR-031–034 / BRULE-008). `callPA` now calls the live flows only
> and normalizes every read response to a canonical shape (unwraps the live envelope → records array;
> adds camelCase aliases; preserves originals), so every page renders live data regardless of envelope
> or field casing. When a flow returns nothing or is unreachable, pages show genuine empty/error
> states — never sample content.
>
> **Hardcoded identity removed (FR-034):** `state.js` no longer contains a `DEFAULT_USER` or a hardcoded
> `USERS` list. The active user is the OTP-authenticated session or one **selected from the live officer
> directory** (E01 references); the header shows the selected user, or "Select User" until one is chosen.
>
> **Other corrections:** the correspondence tracker now **loads records live from E02** (was a seeded
> sample record) and **writes to E14** (was the incorrect E02 read); `registry-movement` starts each
> dossier with an empty minute sheet (seeded sample minutes removed); the phantom `E15` (no source
> flow) was dropped — the registry now has no empty entries (E01–E10, E14, E16, E17, all provisioned).
> External dependencies (FontAwesome CDN, external NITDA logo, Google Fonts `@import`) were all removed;
> `dgceo-tracker` was redesigned into the dgo shell and registered as a nav item.
>
> **Navigation fix:** `enforceGateway()` deferred to `DOMContentLoaded` (it previously ran before
> `state.js`, redirecting every module page to home). With OTP disabled (below) the gateway is inert
> anyway.
>
> **Real-browser smoke test** (`test/smoke.mjs`, Playwright — test-only, not a runtime dep): mocks the
> flows at the browser network layer and validates navigation, live-pipeline rendering, live identity,
> the tracker shell, and zero console errors. Green.
>
> **Fetch & cache strategy (corrected):** read data is no longer refetched on every navigation. Each
> read flow is fetched once (first need / start) and cached per-flow in `localStorage`
> (`dgo_cache_<code>`); navigation reads the cache. Refresh is explicit only: a write to a related flow
> auto-invalidates the affected module cache (`WRITE_INVALIDATES`), and module refresh buttons force a
> refetch (`API.refresh` / `callPA(code, …, { force: true })`). Verified in the smoke test (E02/E04
> fetched exactly once across docs→tasks→index→docs→tracker navigations).
>
> **Startup Fetch-All + loading screen (2026-06-16):** on app start (once per session) a non-navigable
> loading overlay is shown while a single **Fetch-All** loads docs, tasks, emails and references in one
> pass and caches them; navigation then reads the cache. The Fetch-All uses flow **E00** when its URL is
> configured (Settings) and otherwise fans out to the dedicated read flows. **References load once** on
> startup; a manual references refresh re-runs the Fetch-All and is exposed only via Settings/diagnostics.
> The gateway is **shape-aligned to the Fetch-All contract** (`{ok,…,data:{docs,tasks,emails,users,
> categories,departments}}`), including tasks' boolean `Description` (exposed as `hasDescription`) and the
> `RoutedToDSU`/`AssignedToDSU` routing fields. The Fetch-All flow's Response sets
> `Access-Control-Allow-Origin: https://your-host` — **change that placeholder to the app's real origin**
> (this is the CORS item below).
>
> **Still open (environmental):** live data requires the Power Automate flows to permit the app origin
> via **CORS** (a server-side flow config — browser calls otherwise fail the preflight). This is the
> only remaining dependency for live data; proxies are out of scope (FR-011). The tracker maps to the
> generic `E14` catch-all rather than a dedicated correspondence write flow.

This document is the governance and remediation tracking artifact required by **FR-037**
and **NFR-015**. It records the controlled exceptions that remain open during the current
delivery phase, plus a known provisioning limitation. Each exception is temporary and
carries explicit closure criteria.

---

## Exception Register

| ID | Exception | Status | Governing Requirements | Closure Gate |
|----|-----------|--------|------------------------|--------------|
| EXC-01 | OTP authentication disabled (tracked exception) | OPEN (temporary, per FR-036) | FR-036, FR-037, FR-038, NFR-014, NFR-015, BRULE-009 | Re-enable at final security closure |
| EXC-02 | Power Automate flow URLs embedded in the frontend | OPEN (accepted current-phase design) | BR-006, FR-015, FR-016, FR-019, NFR-016, BRULE-005 | Approval & adoption of a proxy layer |

---

## EXC-01 — OTP Authentication Disabled (tracked exception)

- **What:** OTP is **disabled this phase** (`OTP_SECURITY_ACTIVE = false` in
  [`js/identity.js`](js/identity.js)), per **FR-036**. `enforceGateway()` returns early, so no page
  redirects. The OTP request/verify flows (`E16`/`E17`) and the gateway + admin-bypass logic remain
  in place for re-enablement at closure.
- **Why:** Per FR-036 / Assumption 4, OTP is intentionally disabled during the current build /
  remediation phase as a controlled, temporary exception. (This also makes the "snap back to home"
  navigation issue impossible, since the gateway never redirects.)
- **Identity in this phase:** the active user is selected from the **live officer directory**
  (E01 references) via the sidebar switcher, or set by OTP verification when re-enabled. There is no
  hardcoded/default user.
- **Closure criteria (FR-038):**
  1. Set `OTP_SECURITY_ACTIVE = true` and validate `E16`/`E17` end-to-end (request → verify → token).
  2. Enforce OTP/role **server-side** (in the flows or a future proxy) so the client cannot forge it.
  3. Unify the session model so `state.js` and `identity.js` write a single session shape.
- **Owner:** Security Reviewer (per BRD §16 sign-off).

## EXC-02 — Embedded Power Automate Flow URLs

- **What:** Flow trigger URLs (including their SAS `sig` signatures) are embedded in the
  shipped frontend. They are now **centralized** in a single registry, `FLOW_ENDPOINTS` in
  [`js/api.js`](js/api.js) — no module defines its own endpoint (FR-016, FR-017, FR-024).
- **Why (current phase):** Per BR-006 / FR-015 / BRULE-005, direct frontend-to-flow
  integration is the approved model until a proxy layer reaches formal maturity. Proxies and
  intermediaries are explicitly out of scope this phase (FR-011, FR-012).
- **Risk while open:** A Power Automate manual-trigger `sig` is bearer-equivalent. Anyone who
  can read the served JavaScript can invoke the provisioned flows directly. Because these
  values are embedded and committed, **treat them as exposed credentials.**
- **Required controls while open:**
  - **Rotation:** Regenerate the trigger URL/signature for any flow whose `sig` has been
    committed or distributed. Rotation is a one-line change per flow in `FLOW_ENDPOINTS`
    (each URL is built from a `workflowId` + `sig` via the `paUrl()` helper).
  - **Least privilege:** Ensure each flow validates its payload and authorizes server-side;
    do not rely on the client for access control.
  - **Runtime override:** Operators may override any flow URL without a code change via the
    Settings page (stored as `dgo_endpoint_<code>` in localStorage).
- **Closure criteria (FR-019):** On governance approval, introduce a server-side proxy that
  holds signed URLs server-side and exposes only relative endpoints to the client; then
  remove embedded URLs from `FLOW_ENDPOINTS`. This is a future phase, not current scope.
- **Owner:** Architecture Reviewer + Security Reviewer.

### Signature Rotation Log (SEC-01)

Every signature that has been committed must be treated as exposed and rotated. Rotation is a
one-line change per flow in `FLOW_ENDPOINTS` (`paUrl(workflowId, sig)`), or a Settings override
with no redeploy. **Action owner: Security Reviewer.** Record each rotation here.

| Date | Flow code(s) | Workflow GUID(s) | Rotated by | Notes |
|------|--------------|------------------|-----------|-------|
| _pending_ | E00,E01,E02,E03/E05,E04,E06,E07,E08,E09,E10,E14,E16,E17 | all committed GUIDs | — | Initial mandatory rotation of all committed signatures (treat prior values as compromised). |

### Flow-side obligations (cross-boundary, BRULE-001 — implemented IN the flows, not a proxy)

These are the server-side controls the audit requires; they live in the Power Automate flows
(the sole approved integration), tracked here per FR-037 / NFR-015. Owner: Security + Architecture.

1. **Payload-schema validation** on every flow → `4xx` on violation (SEC-01/SEC-04).
2. **Per-caller rate limiting** (SEC-01).
3. **CORS:** set `Access-Control-Allow-Origin` to the **exact** app origin, never `*` (INT-03 / REL-01).
4. **Idempotency:** dedupe writes on `X-DGO-Tx-ID`; a repeated id returns the original result
   without re-executing (INT-01 end-to-end guarantee; client single-flight already lands).
5. **OTP/role enforcement (EXC-01 closure):** E16/E17 issue a server-signed token; sensitive
   flows validate token + role server-side so the client cannot forge access (SEC-02/SEC-04).
6. **Diagnostics sink (REL-02):** optional flow to receive batched telemetry; the client sink is
   built and off until the URL is provisioned in Settings.

---

## Known Limitation — Unprovisioned Flows & Simulation Mode

Recorded for delivery transparency (relevant to FR-031–FR-034). Endpoint values were
reconciled from the source-SPA extraction (`spa_flow_extraction_full.json` /
`consolidated_endpoint_matrix.xlsx`); the workflow GUID is the stable key (source SPAs used
inconsistent local E-numbering).

See `docs/ENDPOINT_MAP.md` for the full revalidated mapping (now cross-checked against the
deployed flow trigger/response schemas).

- **Provisioned (live):** `E01`–`E10`, `E16`, `E17` carry real flow URLs and call Power Automate
  directly. Write-flow mapping was **revalidated against trigger schemas**: `E03`/`E05` →
  "Web - Subsidiary Doc Actions" (`85c556f1…`, contract `{docId,taskId,status,acknowledgedBy}`);
  `E06` → "Deployed - Create Task" (`6b3bad30…`, contract `NewActivityTask`/`Selected`).
  (Corrected from the prior matrix-based guess that routed E03/E05 to `6b3bad30…`.)
  `E16`/`E17` are the OTP Generate/Verify flows (gateway now enabled — see EXC-01).
- **Unprovisioned (empty):**
  - `E14`, `E15` — reserved. `E14` candidate: "Dynamic Multi-Actions" `bc83d98a…` (catch-all).
- **Open data items to verify:**
  - **E02 docs — three candidate GUIDs:** `818ec405…` (wired, used by all source SPAs),
    `5de1fc93…` (endpoint-object variant), and **`7995c1eb…` ("GET_DOCS_OPS_2 / Live_OPS_Fetch_Docs",
    explicitly `verified_and_revalidated`)**. Recommended: functionally validate `7995c1eb…` and
    promote it to E02; the current `818ec405…` is retained meanwhile to avoid regressing a live read.
  - **E07/E08 order:** assigned per stakeholder confirmation (E07 = `c4338863…`; E08 = `1154b50e…`).
  - **Unmapped extra flow:** `7e71fffe…` (unlabeled) — assign or retire deliberately.
- **Behavior when a flow URL is absent (no registry default and no Settings override):**
  - *Read flows* → a genuine **empty state** (no records). There is **no** simulation/sample
    fallback — `API.getSimulation` does not exist (live-only build, FR-031–034).
  - *Write flows* → queued in the **Outbox** with exponential backoff; after
    `OUTBOX_MAX_ATTEMPTS` (or while no URL is configured, logged `outbox_flow_not_configured`)
    they move to the **dead-letter** store, surfaced in Settings for retry/discard (INT-01).
- **Rotation note (EXC-02):** the committed source now embeds live SAS signatures for the Fetch-All
  flow `4a250f97…` (E00), the write flows `85c556f1…`, `6b3bad30…`, `c4338863…`, `1154b50e…`,
  `a942d230…`, the OTP flows `314aaf27…`/`43879c51…`, and the four dedicated read flows. Include all of
  these in the signature rotation required under EXC-02.
