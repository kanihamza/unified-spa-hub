# Delivery Governance — Tracked Exceptions & Limitations

**Platform:** Unified SPA Hub (DGO Digital Operations Hub)
**Baseline:** Dependency-Free HTML Multi-Module Platform with Power Automate HTTP Flow Integration (BRD/FRD v1.0)
**Last updated:** 2026-06-16

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
- **Behavior of an unprovisioned flow:**
  - *Read flows* → deterministic **local simulation** (`API.getSimulation`), used only when a
    URL is absent — an explicit, opt-in dev/offline fallback, logged as `api_simulation_fallback`.
  - *Write flows* → queued in the **Outbox** with backoff; stays queued
    (logged as `outbox_flow_unprovisioned`) until a real URL is configured.
- **Rotation note (EXC-02):** the committed source now embeds live SAS signatures for the write
  flows `85c556f1…`, `6b3bad30…`, `c4338863…`, `1154b50e…`, `a942d230…`, the OTP flows
  `314aaf27…`/`43879c51…`, and the four read flows. Include all of these in the signature
  rotation required under EXC-02.
