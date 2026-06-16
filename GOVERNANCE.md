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
  1. Provision OTP request/verify flows `E16`/`E17`. The flows now exist ("Web - OTP Generate" /
     "Web - OTP Verify", schemas known); only their trigger URLs are needed in `FLOW_ENDPOINTS`.
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

See `docs/ENDPOINT_MAP.md` for the full revalidated mapping (now cross-checked against the
deployed flow trigger/response schemas).

- **Provisioned (live):** `E01`–`E10` carry real flow URLs and call Power Automate directly.
  Write-flow mapping was **revalidated against trigger schemas**: `E03`/`E05` →
  "Web - Subsidiary Doc Actions" (`85c556f1…`, contract `{docId,taskId,status,acknowledgedBy}`);
  `E06` → "Deployed - Create Task" (`6b3bad30…`, contract `NewActivityTask`/`Selected`).
  (Corrected from the prior matrix-based guess that routed E03/E05 to `6b3bad30…`.)
- **Unprovisioned (empty):**
  - `E14`, `E15` — reserved. `E14` candidate: "Dynamic Multi-Actions" `bc83d98a…` (catch-all).
  - `E16`, `E17` — OTP request/verify. The flows **now exist** ("Web - OTP Generate" / "Web - OTP
    Verify", with known schemas) but their trigger **URLs were not provided**, so they remain empty.
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
  flows `85c556f1…`, `6b3bad30…`, `c4338863…`, `1154b50e…`, `a942d230…` (plus the four read flows).
  Include all of these in the signature rotation required under EXC-02.
