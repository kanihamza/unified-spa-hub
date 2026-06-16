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

> **Data contract + demo mode (2026-06-16):** `callPA` now normalizes every read response to a
> canonical shape (unwraps the live envelope → records array; adds camelCase aliases; preserves
> originals), fixing the empty-platform root cause where most pages read `.records`/camelCase but
> live flows return `{docs|tasks|emails:[{ID,Title,…}]}` (audit: only `fast-track`/
> `response-tracking`/`response-matrix` were live-shape-aware). A **demo/simulation mode** was added
> (`API.isDemoMode`/`setDemoMode`, Settings toggle, `?demo=1`) — **opt-in and OFF by default**; it is
> a build/UAT facility, **not** a production data source, reconciling FR-031–034 / BRULE-008 (no
> demo in production-required areas) with the need for a populated UAT environment. `aid-dashboard`
> was integrated into the nav shell (missing `Chrome.bootstrap('aid')` call).
>
> **Open gaps (not yet addressed):**
> 1. `dgceo-tracker.html` is a standalone SPA with its own Tailwind/FontAwesome dark shell and
>    tab-nav — full integration into the dgo design system is a redesign (FR-007).
> 2. **External dependencies** (FR-008 / BRULE-002 / AC-004): `dgceo-tracker.html` loads FontAwesome
>    from a CDN; `dgceo-tracker`, `exec-hub`, `reports`, `response-matrix`, `fast-track` reference an
>    external NITDA logo URL. These must be localised/removed for true dependency-freedom.
> 3. Minor polish: home "Pending" KPI filter is case-sensitive (`PENDING`≠`Pending`); some email
>    date parsing shows "Invalid Date". (Verified only in a jsdom harness — no live browser/CSS/CORS
>    validation was possible.)

This document is the governance and remediation tracking artifact required by **FR-037**
and **NFR-015**. It records the controlled exceptions that remain open during the current
delivery phase, plus a known provisioning limitation. Each exception is temporary and
carries explicit closure criteria.

---

## Exception Register

| ID | Exception | Status | Governing Requirements | Closure Gate |
|----|-----------|--------|------------------------|--------------|
| EXC-01 | OTP gateway — enabled with client-side admin bypass | PARTIAL (server-side enforcement pending) | FR-036, FR-037, FR-038, NFR-014, NFR-015, BRULE-009 | Server-side OTP/role enforcement |
| EXC-02 | Power Automate flow URLs embedded in the frontend | OPEN (accepted current-phase design) | BR-006, FR-015, FR-016, FR-019, NFR-016, BRULE-005 | Approval & adoption of a proxy layer |

---

## EXC-01 — OTP Authentication Gateway (enabled, admin bypass)

- **What:** The OTP gateway is now **enabled** (`OTP_SECURITY_ACTIVE = true` in
  [`js/identity.js`](js/identity.js)) with `E16`/`E17` provisioned. `enforceGateway()` redirects
  unauthenticated, non-admin sessions on protected pages to the OTP login (`index.html`).
  **Admin roles bypass** the gateway (`ADMIN_ROLE_CODES = ['DG']`); `isAdmin()` resolves the active
  identity from an authenticated OTP session, else the active platform identity
  (`State.getActiveUser()`, which defaults to the Director General).
- **Why (admin bypass):** Per stakeholder requirement, administrators retain uninterrupted access.
  The default platform identity (DG) is an admin and is not gated, preserving operational access
  while non-admin roles must authenticate via OTP.
- **Residual risk (still PARTIAL):** The bypass — like the identity switcher — is evaluated
  **client-side**. A user can select the DG identity in the switcher to obtain the bypass; nothing
  is enforced server-side. Treat client role/bypass as advisory, not a security control, until a
  server-side trust boundary exists.
- **Remaining closure criteria (FR-038):**
  1. Enforce OTP/role **server-side** (in the Power Automate flows or a future proxy) so the client
     bypass cannot be forged.
  2. Unify the session model so `js/state.js` and `js/identity.js` write a single session shape
     (the switcher must not grant an implicit admin session without a token/`expiresAt`).
  3. Validate the live `E16`/`E17` flows end-to-end (request → verify → token).
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
