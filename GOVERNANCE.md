# Delivery Governance — Tracked Exceptions & Limitations

**Platform:** Unified SPA Hub (DGO Digital Operations Hub)
**Baseline:** Dependency-Free HTML Multi-Module Platform with Power Automate HTTP Flow Integration (BRD/FRD v1.0)
**Last updated:** 2026-06-15

This document is the governance and remediation tracking artifact required by **FR-037**
and **NFR-015**. It records the controlled exceptions that remain open during the current
delivery phase, plus a known provisioning limitation. Each exception is temporary and
carries explicit closure criteria.

---

## Exception Register

| ID | Exception | Status | Governing Requirements | Closure Gate |
|----|-----------|--------|------------------------|--------------|
| EXC-01 | OTP authentication gateway disabled | OPEN (temporary, tracked) | FR-036, FR-037, FR-038, NFR-014, NFR-015, BRULE-009 | Final security remediation closure |
| EXC-02 | Power Automate flow URLs embedded in the frontend | OPEN (accepted current-phase design) | BR-006, FR-015, FR-016, FR-019, NFR-016, BRULE-005 | Approval & adoption of a proxy layer |

---

## EXC-01 — OTP Authentication Gateway Disabled

- **What:** The one-time-password identity gateway is inert. `OTP_SECURITY_ACTIVE = false`
  in [`js/identity.js`](js/identity.js); `enforceGateway()` returns immediately and does not
  redirect unauthenticated sessions. Active identity is selected client-side via the sidebar
  identity switcher (`js/state.js`).
- **Why (current phase):** Per Assumption 4 / FR-036, OTP is intentionally disabled to keep
  an unauthenticated build/remediation flow for development and testing.
- **Risk while open:** There is no enforced authentication or authorization boundary on the
  client. Any user can select any identity (including Director General) and reach every page.
  Role is cosmetic. This is acceptable **only** for non-production build/test use.
- **Closure criteria (FR-038):**
  1. Provision OTP request/verify flows `E16`/`E17` (URLs in `FLOW_ENDPOINTS`, `js/api.js`).
  2. Set `OTP_SECURITY_ACTIVE = true`.
  3. Unify the session model so `js/state.js` and `js/identity.js` write a single session
     shape (the identity switcher must not bypass the authenticated session / `expiresAt`).
  4. Re-test `enforceGateway()` redirects on every protected page.
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

- **Provisioned (live):** `E01`, `E02`, `E03`, `E04`, `E05`, `E06`, `E07`, `E08`, `E09`, `E10`
  carry real flow URLs and call Power Automate directly. `E03`/`E05`/`E06` intentionally share
  the unified mutation flow `6b3bad30…`, differentiated by payload `action`/`status`.
- **Unprovisioned (empty):**
  - `E14`, `E15` — reserved; **no source flow was identified** for them.
  - `E16`, `E17` — OTP request/verify; **no OTP flow exists** in any source SPA (consistent with
    EXC-01). They remain empty until an OTP flow is built.
- **Open data items to verify:**
  - **E02 docs GUID conflict:** `E02` uses the operational/interceptor GUID `818ec405…` (used by
    all three source SPAs as Get Docs). One source file's *endpoint object* declared Get Docs as
    `5de1fc93…` instead. The operational GUID is wired; `5de1fc93…` should be confirmed or discarded.
  - **E07/E08 order:** assigned per stakeholder confirmation (E07 = Bulk Assign `c4338863…`;
    E08 = Bulk Ops Assign `1154b50e…`). Trivially swappable if validated otherwise.
  - **Unmapped extra flows** present in the extraction but with no platform E-code:
    `bc83d98a…` (Dynamic Global), `85c556f1…` (Subsidiary/Supplementary Actions),
    `7e71fffe…` (unlabeled). Assign or retire deliberately.
- **Behavior of an unprovisioned flow:**
  - *Read flows* → deterministic **local simulation** (`API.getSimulation`), used only when a
    URL is absent — an explicit, opt-in dev/offline fallback, logged as `api_simulation_fallback`.
  - *Write flows* → queued in the **Outbox** with backoff; stays queued
    (logged as `outbox_flow_unprovisioned`) until a real URL is configured.
- **Rotation note (EXC-02):** wiring the write flows added live SAS signatures for `6b3bad30…`,
  `c4338863…`, `1154b50e…`, and `a942d230…` to the committed source. Include these in the
  signature rotation required under EXC-02.
