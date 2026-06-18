# Flow Wire Contracts (INT-02)

Authoritative request/response shapes for every Power Automate HTTP-trigger flow the
platform calls. The client's normalization layer (`js/api.js` → `aliasDoc` / `aliasTask` /
`aliasEmail` / `normalizeReferences`) maps these onto a **canonical record shape** so pages
never depend on backend field casing. This document is the contract; the `pick()` fallbacks
in `api.js` are defensive resilience, **not** a substitute for it.

> Trigger URLs and signatures are governed in `js/api.js` (`FLOW_ENDPOINTS`) and
> `docs/ENDPOINT_MAP.md`. A CI lint asserts the GUIDs here-referenced match code.

## Common envelope

All read flows SHOULD return the live envelope:

```jsonc
{ "ok": true,
  "status": { "http": 200, "code": "OK", "message": "Success" },
  "data": { /* entity arrays — see below */ },
  "errors": [], "meta": {} }
```

The Fetch-All (E00) returns every entity in one pass under `data`:
`{ docs[], tasks[], emails[], users[], categories[], departments[], taskComments[] }`.
Per-entity read flows may return their array under `data.<entity>`, a top-level
`<entity>` key, or `records`/`results`/`items`/`value` — all are accepted by `extractArray`.

## Request headers (sent by the client)

| Header | Value | Purpose |
|---|---|---|
| `Content-Type` | `application/json` | — |
| `X-DGO-Trigger` | `Platform-Client` \| `Platform-Outbox-Agent` | origin tag |
| `X-Correlation-ID` | `DGO-TX-<ts>` (reads) / outbox tx id (writes) | tracing (REL-02) |
| `X-DGO-Tx-ID` | outbox transaction id (writes only) | **idempotency key — flows MUST dedupe on this** (INT-01) |

## Read entity field contracts → canonical aliases

**Documents (E02 `7995c1eb`, or `data.docs` of E00)** → `aliasDoc`:

| Backend field(s) | Canonical |
|---|---|
| `id` / `ID` | `id` |
| `Title` | `title` |
| `AssignmentStatus` / `Status` | `status` |
| `Sender` / `From` | `sender` |
| `Category` | `category` |
| `AssignedTo` / `Assigned` | `assignee` |
| `Description` | `directives` |
| `AttachmentLink` | `link` (rendered via `Sanitizer.safeUrl`) |
| `RoutedToDSU` | `routing` |

**Tasks (E04 `37642ba3`, or `data.tasks`)** → `aliasTask`:

| Backend field(s) | Canonical | Note |
|---|---|---|
| `ID` | `id` | |
| `Title` | `title` | |
| `Progress` / `Status` | `status` | |
| `Priority` | `priority` | |
| `AssignedTo` | `assignee` | |
| `Description` (**boolean**) | `hasDescription` | boolean "has a description", not text |
| `DueDate` | `dueDate` | |
| `Classification` / `Category` | `category` | |
| `RefIDD` / `Reference_ID` | `refIDD` | |
| `RoutedToDSU` / `AssignedToDSU` / `GDSUROUT` | `routing` | |
| `Comments` | `lastUpdateNotes` | |

**Emails (E09 `3931e2ff`, or `data.emails`)** → `aliasEmail`:

| Backend field(s) | Canonical |
|---|---|
| `id` / `ID` | `id` |
| `Subject` | `subject` |
| `fromAddress` / `fromName` / `from.emailAddress.address` | `sender` |
| `bodyContent` / `bodyPreview` / `body.content` / `bodyHtml` | `body` (rendered via `Sanitizer.cleanHTML`) |
| `assignmentStatus` / `AssignmentStatus` | `status` / `assignmentStatus` |
| `receivedDateTime` | `received` |

**References (E01 `ff455c68`, or `data.{users,categories,departments}`)** → `normalizeReferences`
yields `{ departments[], officers[], categories[], users[] }` with `id/name/code`,
`officers[].{id,name,role,dsu,email}`, and `categories[].{code,name,defaultAssignee,supportDSU,defaultPriority}`.

## Write flow contracts (server MUST validate + dedupe on `X-DGO-Tx-ID`)

| Code | Flow | Request payload (contract) |
|---|---|---|
| E03 | Subsidiary Doc Actions | `{ docId, status, action }` |
| E05 | Subsidiary Doc Actions | `{ taskId, status, acknowledgedBy }` |
| E06 | Create Task | `{ NewActivityTask, Selected, AssignmentType }` |
| E07 | Bulk Assign | `{ mode:"bulk", SelectedItems[] }` |
| E08 | Bulk Ops Assign | batch allocation payload |
| E10 | Email → Task | `{ Email, NewActivityTask }` |
| E14 | Dynamic Multi-Actions | correspondence-tracker action payload (catch-all) |
| E16 | OTP Generate | `{ email }` → `{ success }` |
| E17 | OTP Verify | `{ email, otp }` → `{ success, token, user:{id,name,role,roleCode,dsu}, expiresAt }` |

**Write responses:** `2x` on accept. A repeated `X-DGO-Tx-ID` MUST return the original
result without re-executing (idempotency). On a non-2xx the client retries with exponential
backoff and, after `OUTBOX_MAX_ATTEMPTS`, dead-letters the item for manual review (INT-01).

## Server-side obligations (cross-boundary, tracked in GOVERNANCE.md)

Per BRULE-001 the flows are the only backend, so these controls live **in the flows**:
payload-schema validation (`4xx` on violation), per-caller rate limiting,
`Access-Control-Allow-Origin: <exact app origin>`, idempotency dedup on `X-DGO-Tx-ID`,
and (at EXC-01 closure) server-side OTP/role enforcement of the E17-issued token.
