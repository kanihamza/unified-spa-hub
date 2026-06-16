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

Not an exception, but recorded for delivery transparency (relevant to FR-031–FR-034).

- **Provisioned (live):** `E01`, `E02`, `E04`, `E09` carry real flow URLs and call Power
  Automate directly.
- **Unprovisioned:** `E03`, `E05`, `E06`, `E07`, `E08`, `E10`, `E14`, `E15`, `E16`, `E17`
  have **empty** URLs in `FLOW_ENDPOINTS` because real trigger URLs were not available at
  build time. Real URLs must be supplied (in `FLOW_ENDPOINTS` or via Settings) before these
  capabilities are production-complete.
- **Behavior of an unprovisioned flow:**
  - *Read flows* → deterministic **local simulation** (`API.getSimulation`), used only when a
    URL is absent. This is an explicit, opt-in dev/offline fallback — not production data, and
    not a hidden placeholder. It is logged as `api_simulation_fallback` in telemetry.
  - *Write flows* → the request is queued in the **Outbox** and retried with backoff; it stays
    queued (logged as `outbox_flow_unprovisioned`) until a real URL is configured.
- **Action to close:** Provision the remaining flow URLs, then confirm no `api_simulation_fallback`
  events occur on production-required read paths.
