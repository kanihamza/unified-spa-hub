# Endpoint Configuration & Mapping (Revalidated)

Authoritative mapping of platform flow codes → deployed Power Automate flows, revalidated
against the flow trigger/response schema scaffolds (`Flow_Run_Trigger_Schema…` /
`Flow_Run_Responses_Scaffold…`). The **workflow GUID is the stable key**; source SPAs used
inconsistent local E-numbering, so flows are matched by **purpose and payload contract**.

All URLs share the base:
`https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/<GUID>/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=<SIG>`

## Provisioned flows (12)

| Code | Purpose | Type | Workflow GUID | `sig` (trunc) | Deployed flow / trigger schema | Status |
|------|---------|------|---------------|---------------|-------------------------------|--------|
| E01 | References & lookups | Read | `ff455c68…01fb` | `jajFVxbv…` | Fetch_References_and_Lookups_Data (`action`…`odataFilter`) | ✅ |
| E02 | Inbound dossiers | Read | `818ec405…8b74` | `MgQUY52I…` | FETCH_DOCS_V2 (`action`…`requestId`,`trackingID`) | ✅ ⚠️ see note |
| E04 | Action tasks | Read | `37642ba3…6519` | `hklOSh62…` | Fetch_Tasks (`{status, pagination}`) | ✅ |
| E09 | Mailbox sync | Read | `3931e2ff…9797` | `SV7I2t9w…` | Fetch_Emails (`folderPath`,`top`,`skip`,`fetchOnlyUnread`) | ✅ |
| E03 | Update dossier status / flag | Write | `85c556f1…0b91` | `8ikbMhXr…` | **Web - Subsidiary Doc Actions** (`docId`,`status`,`action`) | ✅ revalidated |
| E05 | Update task progress / acknowledge | Write | `85c556f1…0b91` | `8ikbMhXr…` | **Web - Subsidiary Doc Actions** (`taskId`,`status`,`acknowledgedBy`) | ✅ revalidated |
| E06 | Single task assignment | Write | `6b3bad30…f2ed` | `1kJge9P2…` | Deployed - Create Task (`NewActivityTask`,`Selected`,`AssignmentType`) | ✅ |
| E07 | Uniform bulk broadcast | Write | `c4338863…5b23` | `yST47ItN…` | optimized Bulk Assign (`mode:bulk`,`SelectedItems`) | ✅ |
| E08 | AI batch allocator | Write | `1154b50e…a02c` | `Swbi7nJC…` | Bulk Ops Assign | ✅ |
| E10 | Email → task directive | Write | `a942d230…048b` | `KAItnmgc…` | Web - Email Task Created (`Email`,`NewActivityTask`) | ✅ |
| E16 | OTP request | Identity | `314aaf27…5936` | `OWBIO1oo…` | Web - OTP Generate (`otp_code`) | ✅ |
| E17 | OTP verify | Identity | `43879c51…3f27` | `zO21cB8G…` | Web - OTP Verify (`otp_code`,`channel`,`request_id`) | ✅ |

OTP gateway is enabled with admin bypass (`ADMIN_ROLE_CODES = ['DG']`) — see GOVERNANCE.md EXC-01.

## Unprovisioned flows (no usable URL yet)

| Code | Purpose | Status | Note |
|------|---------|--------|------|
| E14 | Reserved (catch-all) | ⛔ | Candidate: Dynamic Multi-Actions `bc83d98a…` (`_Co-r3TG…`) — superset action flow |
| E15 | Reserved | ⛔ | No source flow identified |

## Revalidation corrections & open items

1. **E03/E05 remapped** from the create-task flow `6b3bad30…` to **`85c556f1…` (Subsidiary Doc
   Actions)**. Justification: the trigger schema for `85c556f1` is exactly `{docId, taskId,
   acknowledgedBy, status}`, which matches the payloads the platform already sends for status
   updates and acknowledgements (e.g. `response-tracking.js` ack → `{taskId, status,
   acknowledgedBy}`). `6b3bad30` ("Deployed - Create Task") instead requires `NewActivityTask`
   and is the correct target only for **E06** (single/bulk assignment creation).
2. **E02 docs — three candidate GUIDs:**
   - `818ec405…` — currently wired (interceptor/FETCH_DOCS_V2; used by all three source SPAs).
   - `5de1fc93…` — Get Docs "endpoint object" variant from one source file.
   - `7995c1eb…` (`G9ti0-fz…`) — **"GET_DOCS_OPS_2 / Live_OPS_Fetch_Docs", marked
     `verified_and_revalidated`.** Recommended: functionally validate, then promote to E02.
3. **E07/E08 order** assigned per stakeholder confirmation (E07 = Bulk Assign `c4338863…`;
   E08 = Bulk Ops Assign `1154b50e…`).
4. **OTP provisioned & gateway enabled (EXC-01)** — E16/E17 wired (Generate `314aaf27…`,
   Verify `43879c51…`); the gateway is active with a client-side admin bypass
   (`ADMIN_ROLE_CODES = ['DG']`). Remaining: server-side OTP/role enforcement.

## All 15 distinct workflow GUIDs seen across sources

`ff455c68` (refs), `818ec405` (docs), `5de1fc93` (docs alt), `7995c1eb` (docs verified Live-OPS),
`37642ba3` (tasks), `3931e2ff` (emails), `6b3bad30` (create task), `c4338863` (bulk assign),
`1154b50e` (bulk ops assign), `a942d230` (email→task), `85c556f1` (subsidiary doc actions),
`bc83d98a` (dynamic multi-actions), `7e71fffe` (unlabeled), `314aaf27` (OTP generate),
`43879c51` (OTP verify).
