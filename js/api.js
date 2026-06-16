/* ============================================================
   DGO v2.3 — Secure API Gateway & Outbox Orchestrator
   ------------------------------------------------------------
   SINGLE SOURCE OF TRUTH for every Power Automate HTTP-trigger
   flow endpoint. No other module may define its own flow URLs.
   See GOVERNANCE.md for the embedded-URL and OTP exceptions.
   ============================================================ */

const API = (() => {
  const OUTBOX_KEY = 'dgo_sync_outbox';

  // ── Central Flow Endpoint Registry ─────────────────────────────────────────
  // Flow URLs are embedded in the frontend during the current delivery phase
  // (no proxy/intermediary — see GOVERNANCE.md, BR-006 / FR-015 / FR-016) and
  // are centrally managed here. Each URL is built from its workflow id + SAS
  // signature so rotation is a one-line change per flow.
  // An empty string means the flow is NOT yet provisioned; such a flow runs in
  // local simulation mode (reads) or stays queued in the Outbox (writes) until
  // a real URL is supplied here or via Settings (localStorage `dgo_endpoint_<code>`).
  const PA_BASE = 'https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows';
  const PA_QS = 'api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0';
  const paUrl = (workflowId, sig) => `${PA_BASE}/${workflowId}/triggers/manual/paths/invoke?${PA_QS}&sig=${sig}`;

  const FLOW_ENDPOINTS = {
    // Read flows (provisioned)
    E01: paUrl('ff455c68e9ac493e858fb984bcfd01fb', 'jajFVxbv67HbcKqvV8h6JBPm9TPG60yDnhRjy9WmpPU'), // Reference / lookup directory
    E02: paUrl('7995c1eb50d94d5daa2780e71391d874', 'G9ti0-fzVRwt8fdGGheNgSrvIoMCcXKEibCaBDci4oE'), // Inbound dossiers (OData) — GET_DOCS_OPS_2 (verified_and_revalidated). Legacy: 818ec405 / MgQUY52I
    E04: paUrl('37642ba3597f4cf58288cc71b5e6b519', 'hklOSh62A6jmQuhX28NYQMaxlVEG8fC05LVsyVz7YX4'), // Action tasks (OData)
    E09: paUrl('3931e2ff995242b6b2c920c8b2209797', 'SV7I2t9wmS0sWBGpHoIKg8I3E8ATk1KFrqrjC9Gih0U'), // Mailbox sync (OData)

    // Write / action flows (mapping revalidated against deployed flow trigger schemas)
    // E03/E05 → "Web - Subsidiary Doc Actions" (docId/taskId/status/acknowledgedBy).
    // E06 → "Deployed - Create Task" (Hybrid Assign: NewActivityTask/Selected/SelectedItems).
    E03: paUrl('85c556f10b8244ba9d839a2ebe240b91', '8ikbMhXrOn_L4QRUBF94wiq2swh7GlNVY_GZ5BD5jK0'), // Update dossier status / flag document
    E05: paUrl('85c556f10b8244ba9d839a2ebe240b91', '8ikbMhXrOn_L4QRUBF94wiq2swh7GlNVY_GZ5BD5jK0'), // Update task progress / acknowledge
    E06: paUrl('6b3bad3005b44bf6bced0f8074d3f2ed', '1kJge9P2IOMOLRZOK-cVb3bcDJbuDhbR8x9h0TvHspQ'), // Single task assignment (Create Task)
    E07: paUrl('c43388639d14452faef4ca3042a95b23', 'yST47ItNduW705P1gJu9CDyfa_LKghM8eTP8aBl48iU'), // Uniform bulk broadcast (Bulk Assign)
    E08: paUrl('1154b50e1d17420dadb3b012e7e2a02c', 'Swbi7nJCn3-VSSz4KN1YxHfxFPfO-EUWsF-czBS3zs4'), // AI batch allocator (Bulk Ops Assign)
    E10: paUrl('a942d230337c4ddfa9a386e92bbd048b', 'KAItnmgczUUEDkJQvICwLdfbTZ3IBbPpaPePNqz0A7U'), // Email-to-task directive (Create Task for Email)
    E14: paUrl('bc83d98acf474a088832d78f50085388', '_Co-r3TG6rtP0yGDDJXIM90WD4Wpym2NmR5OyOSsgnY'), // Dynamic Multi-Actions (catch-all)
    E15: '', // Reserved — no source flow identified

    // Identity / OTP flows — provisioned. Gateway enabled with admin bypass (see js/identity.js).
    E16: paUrl('314aaf27593147089b38322e5ca25936', 'OWBIO1ooq0y8Zh9BTPp3sBOQoyVWs_a463FhFUT66fU'), // OTP request ("Web - OTP Generate")
    E17: paUrl('43879c5165de439680055ab4258b3f27', 'zO21cB8Gn-LDklvld-xWtGUuZDvCleHWR6j5N6s5Dyo')  // OTP verify ("Web - OTP Verify")
  };

  const WRITE_FLOWS = ['E03', 'E05', 'E06', 'E07', 'E08', 'E10', 'E14', 'E15'];
  const PAGINATED_FLOWS = ['E02', 'E04', 'E09'];
  const FLOW_CODES = Object.keys(FLOW_ENDPOINTS);

  /**
   * Resolve the active URL for a flow code: a per-flow runtime override
   * (Settings) takes precedence over the central registry default.
   */
  function getEndpoint(code) {
    const override = localStorage.getItem(`dgo_endpoint_${code}`);
    if (override) return override;
    return FLOW_ENDPOINTS[code] || '';
  }

  // ── Demo / simulation mode (OPT-IN, OFF by default) ─────────────────────────
  // Lets the platform run populated without live flows during build/UAT. Never
  // the default production path (see GOVERNANCE.md). Enable via Settings or
  // ?demo=1 (persisted); ?demo=0 disables.
  function isDemoMode() {
    try {
      if (typeof location !== 'undefined' && /[?&]demo=1\b/.test(location.search)) { localStorage.setItem('dgo_demo_mode', '1'); return true; }
      if (typeof location !== 'undefined' && /[?&]demo=0\b/.test(location.search)) { localStorage.removeItem('dgo_demo_mode'); return false; }
      return localStorage.getItem('dgo_demo_mode') === '1';
    } catch { return false; }
  }
  function setDemoMode(on) { try { on ? localStorage.setItem('dgo_demo_mode', '1') : localStorage.removeItem('dgo_demo_mode'); } catch {} }

  // ── Response normalization ──────────────────────────────────────────────────
  // Live flows wrap data in an envelope ({ok,status,timing,docs:[...]}) with
  // PascalCase fields; several pages read a flat {records:[...]} with camelCase
  // fields. Normalize at the gateway so EVERY page works against the live
  // contract: expose both `records` and the entity key, add camelCase aliases,
  // and preserve original fields (so live-shape modules keep working).
  const ENTITY_KEY = { E02: 'docs', E04: 'tasks', E09: 'emails' };

  function pick(rec, ...getters) {
    for (const g of getters) {
      try { const v = typeof g === 'function' ? g(rec) : rec[g]; if (v != null && v !== '') return v; } catch {}
    }
    return undefined;
  }
  const aliasDoc = (r) => Object.assign({}, r, {
    id: pick(r, 'id', 'ID'), title: pick(r, 'title', 'Title'),
    status: pick(r, 'status', 'AssignmentStatus', 'Status'),
    sender: pick(r, 'sender', 'Sender', 'From') || '',
    category: pick(r, 'category', 'Category'),
    assignee: pick(r, 'assignee', 'AssignedTo'),
    directives: pick(r, 'directives', 'Description')
  });
  const aliasTask = (r) => Object.assign({}, r, {
    id: pick(r, 'id', 'ID'), title: pick(r, 'title', 'Title'),
    status: pick(r, 'status', 'Progress', 'Status'),
    priority: pick(r, 'priority', 'Priority'),
    assignee: pick(r, 'assignee', 'AssignedTo', 'Assigned'),
    directives: pick(r, 'directives', 'Description'),
    dueDate: pick(r, 'dueDate', 'DueDate'),
    category: pick(r, 'category', 'Classification', 'Category'),
    refIDD: pick(r, 'refIDD', 'RefIDD'),
    routing: pick(r, 'routing', 'GDSUROUT'),
    lastUpdateNotes: pick(r, 'lastUpdateNotes', 'Comments') || ''
  });
  const aliasEmail = (r) => Object.assign({}, r, {
    id: pick(r, 'id', 'ID'), subject: pick(r, 'subject', 'Subject'),
    sender: pick(r, 'sender', 'fromAddress', (x) => x.from && x.from.emailAddress && x.from.emailAddress.address) || '',
    body: pick(r, 'body', 'bodyPreview', (x) => x.body && x.body.content, 'bodyHtml') || '',
    bodyPreview: pick(r, 'bodyPreview', 'body'),
    status: pick(r, 'status', 'assignmentStatus', 'AssignmentStatus') || 'PENDING',
    assignmentStatus: pick(r, 'assignmentStatus', 'AssignmentStatus', 'status') || 'PENDING',
    received: pick(r, 'received', 'receivedDateTime')
  });
  const ALIASER = { E02: aliasDoc, E04: aliasTask, E09: aliasEmail };

  function extractArray(raw, code) {
    if (Array.isArray(raw)) return raw;
    const r = raw || {};
    const cands = [ENTITY_KEY[code], 'records', 'results', 'items', 'value'].filter(Boolean);
    for (const k of cands) if (Array.isArray(r[k])) return r[k];
    if (r.data) { if (Array.isArray(r.data)) return r.data; for (const k of cands) if (Array.isArray(r.data[k])) return r.data[k]; }
    return [];
  }
  function normalizeReferences(raw) {
    const src = (raw && raw.data && (raw.data.categories || raw.data.departments || raw.data.users)) ? raw.data : (raw || {});
    const departments = (src.departments || []).map((d) => Object.assign({}, d, {
      id: pick(d, 'id', 'ID'), name: pick(d, 'name', 'Title'), code: pick(d, 'code', 'DSU_KEY')
    }));
    const officers = ((src.officers && src.officers.length) ? src.officers : (src.users || [])).map((o) => Object.assign({}, o, {
      id: pick(o, 'id', 'email', 'ID'), name: pick(o, 'name', 'Title'),
      role: pick(o, 'role', 'jobTitle', 'AuthorTitle') || '', dsu: pick(o, 'dsu', 'department', 'DSU_KEY') || ''
    }));
    const categories = (src.categories || []).map((c) => Object.assign({}, c, {
      code: pick(c, 'code', 'Category', 'DSU_KEY', (x) => x.ID != null ? String(x.ID) : undefined),
      name: pick(c, 'name', 'Title', 'Category'),
      defaultAssignee: pick(c, 'defaultAssignee'), supportDSU: pick(c, 'supportDSU', 'INFORMDSU1'),
      defaultPriority: pick(c, 'defaultPriority', 'Priority') || 'MEDIUM'
    }));
    return Object.assign({}, raw, { departments, officers, categories, users: src.users || officers });
  }
  function normalizeResponse(code, raw) {
    if (code === 'E01') return normalizeReferences(raw);
    const aliaser = ALIASER[code];
    if (!aliaser) return raw;
    const arr = extractArray(raw, code).map(aliaser);
    const base = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const out = Object.assign({}, base, { records: arr });
    if (ENTITY_KEY[code]) out[ENTITY_KEY[code]] = arr;
    return out;
  }


  const Outbox = {
    get: () => {
      try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch { return []; }
    },
    save: (queue) => { localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue)); },
    async push(code, payload) {
      const queue = this.get();
      const outboxId = `OUTBOX-TX-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      const entry = { id: outboxId, code, payload, timestamp: new Date().toISOString(), attempts: 0, nextRetry: Date.now() };
      queue.push(entry);
      this.save(queue);
      this.process();
      return { success: true, outboxId, status: 'QUEUED_LOCAL' };
    },
    async process() {
      if (!navigator.onLine) {
        if (window.Chrome) window.Chrome.showToast("Offline mode active. Operations queued.", "warning");
        return;
      }
      let queue = this.get();
      if (queue.length === 0) return;

      const activeQueue = [...queue];
      for (let item of activeQueue) {
        if (item.nextRetry > Date.now()) continue;
        try {
          const url = getEndpoint(item.code);
          if (!url) {
            // Flow not provisioned yet — leave queued for a future flush.
            if (window.Telemetry) window.Telemetry.log("outbox_flow_unprovisioned", { code: item.code, txId: item.id });
            continue;
          }

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-DGO-Trigger': 'Platform-Outbox-Agent', 'X-DGO-Tx-ID': item.id },
            body: JSON.stringify(item.payload)
          });

          if (response.ok) {
            queue = this.get().filter(q => q.id !== item.id);
            this.save(queue);
            if (window.Chrome) window.Chrome.showToast(`Flow ${item.code} successfully synchronized.`, 'success');
          } else {
            throw new Error(`Server returned status code: ${response.status}`);
          }
        } catch (err) {
          item.attempts++;
          const backoff = Math.min(10000 * Math.pow(2, item.attempts), 7200000);
          item.nextRetry = Date.now() + backoff;
          const currentQueue = this.get();
          const target = currentQueue.find(q => q.id === item.id);
          if (target) {
            target.attempts = item.attempts;
            target.nextRetry = item.nextRetry;
            this.save(currentQueue);
          }
        }
      }
    }
  };

  window.addEventListener('online', () => {
    if (window.Chrome) window.Chrome.showToast("Network connection restored. Syncing outbox queue...", "info");
    Outbox.process();
  });

  function getCustomEndpoints() {
    const ep = {};
    FLOW_CODES.forEach(k => { ep[k] = localStorage.getItem(`dgo_endpoint_${k}`) || ''; });
    return ep;
  }

  function saveCustomEndpoints(endpoints) {
    for (const key in endpoints) {
      if (endpoints[key]) {
        localStorage.setItem(`dgo_endpoint_${key}`, endpoints[key]);
      } else {
        localStorage.removeItem(`dgo_endpoint_${key}`);
      }
    }
  }

  async function callPA(code, payload = {}) {
    if (PAGINATED_FLOWS.includes(code)) {
      payload.pagination = payload.pagination || { top: 50, skip: 0 };
    }

    // Demo/simulation mode (opt-in): never touches live flows.
    if (isDemoMode()) {
      if (window.Telemetry) window.Telemetry.log("api_demo_mode", { code });
      if (WRITE_FLOWS.includes(code)) return { success: true, status: 'SIMULATED', outboxId: 'DEMO-' + Date.now() };
      return normalizeResponse(code, getMockResponse(code, payload));
    }

    if (WRITE_FLOWS.includes(code)) {
      return await Outbox.push(code, payload);
    }

    const url = getEndpoint(code);
    if (!url) {
      // Unprovisioned flow → deterministic local simulation (dev/offline only).
      if (window.Telemetry) window.Telemetry.log("api_simulation_fallback", { code });
      return normalizeResponse(code, getMockResponse(code, payload));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-DGO-Trigger': 'Platform-Client', 'X-Correlation-ID': `DGO-TX-${Date.now()}` },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      // Normalize the live envelope/field shape to the platform's canonical shape.
      return normalizeResponse(code, await response.json());
    } catch (e) {
      clearTimeout(timeoutId);
      if (window.Telemetry) window.Telemetry.log("api_invocation_error", { code, error: e.message });
      throw e;
    }
  }

  // Seed data for demo/simulation mode (opt-in only — see GOVERNANCE.md).
  const DEMO_REFERENCES = {
    departments: [
      { id: "DSU01", name: "Director General's Office (DGO)", code: "DGO" },
      { id: "DSU02", name: "Registry Department", code: "REG" },
      { id: "DSU03", name: "e-Government Infrastructure (EGI)", code: "EGI" },
      { id: "DSU04", name: "Standards Guidelines & Frameworks (SGF)", code: "SGF" }
    ],
    officers: [
      { id: "O01", name: "Kashifu Inuwa Abdullahi", role: "Director General (DG)", dsu: "DSU01" },
      { id: "O02", name: "Bala Ibrahim", role: "Registry Director", dsu: "DSU02" },
      { id: "O03", name: "Dr. Muhammad Sirajo", role: "Director (EGI)", dsu: "DSU03" },
      { id: "O04", name: "Salisu Kaka", role: "Director (SGF)", dsu: "DSU04" }
    ],
    categories: [
      { code: "CAT_INFRA", name: "Infrastructure Audit", defaultAssignee: "O03", supportDSU: "DSU03", defaultPriority: "HIGH" },
      { code: "CAT_POLICY", name: "Policy Guidelines Compliance", defaultAssignee: "O04", supportDSU: "DSU04", defaultPriority: "MEDIUM" }
    ]
  };
  const DEMO_DOCS = [
    { id: "DOC-2026-A101", title: "NITDA Infrastructure Audit Directive", sender: "Office of the DG", status: "PENDING", category: "Infrastructure Audit", RefIDD: "DOC-2026-A101" },
    { id: "DOC-2026-A102", title: "Policy Guidelines Compliance Review", sender: "SGF Directorate", status: "ROUTED", category: "Policy Guidelines Compliance", RefIDD: "DOC-2026-A102" },
    { id: "DOC-2026-A103", title: "e-Gov Platform MOU Draft", sender: "EGI Department", status: "DRAFT", category: "Infrastructure Audit", RefIDD: "DOC-2026-A103" },
    { id: "DOC-2026-A104", title: "Quarterly Registry Movement Report", sender: "Registry Dept", status: "COMPLETED", category: "Policy Guidelines Compliance", RefIDD: "DOC-2026-A104" }
  ];
  const DEMO_TASKS = [
    { id: "TSK-88121", title: "Conduct EGI infra gap assessment", status: "PENDING", priority: "HIGH", assignee: "O03", refIDD: "DOC-2026-A101", dueDate: "2026-06-23", directives: "Audit core network and submit findings.", category: "Infrastructure Audit", routing: "EGI", lastUpdateNotes: "Awaiting kickoff." },
    { id: "TSK-88122", title: "Draft compliance advisory note", status: "ROUTED", priority: "MEDIUM", assignee: "O04", refIDD: "DOC-2026-A102", dueDate: "2026-06-30", directives: "Align with SGF policy framework.", category: "Policy Guidelines Compliance", routing: "SGF", lastUpdateNotes: "Draft in progress." },
    { id: "TSK-88123", title: "Verify registry file movements", status: "PENDING", priority: "LOW", assignee: "O02", refIDD: "DOC-2026-A104", dueDate: "2026-07-05", directives: "Cross-check movement ledger.", category: "Policy Guidelines Compliance", routing: "REG", lastUpdateNotes: "" },
    { id: "TSK-88124", title: "Prepare MOU legal review", status: "COMPLETED", priority: "HIGH", assignee: "O03", refIDD: "DOC-2026-A103", dueDate: "2026-06-18", directives: "Submit to LSD.", category: "Infrastructure Audit", routing: "LSD", lastUpdateNotes: "Completed and routed." }
  ];
  const DEMO_EMAILS = [
    { id: "EML-501", subject: "RE: Infrastructure Audit DOC-2026-A101", sender: "partner@vendor.com", body: "Please find attached the audit pre-read.", assignmentStatus: "PENDING", received: "2026-06-15T09:00:00Z" },
    { id: "EML-502", subject: "Policy compliance clarification", sender: "legal@nitda.gov.ng", body: "Seeking clarification on DOC-2026-A102.", assignmentStatus: "PENDING", received: "2026-06-14T14:30:00Z" },
    { id: "EML-503", subject: "MOU draft feedback", sender: "egi.lead@nitda.gov.ng", body: "Comments on the MOU draft attached.", assignmentStatus: "ROUTED", received: "2026-06-13T11:15:00Z" }
  ];

  /**
   * Deterministic local simulation payloads. Used only in demo mode or when a
   * flow has no configured URL. Explicit, opt-in — not production data. Prefers
   * any real cached records (from a prior live sync) over the built-in seed.
   */
  function getMockResponse(code, payload) {
    const cached = (getter, seed) => { const c = getter(); return (c && c.length) ? c : seed; };
    switch (code) {
      case 'E01': return DEMO_REFERENCES;
      case 'E02': return { records: cached(getStoredDocuments, DEMO_DOCS) };
      case 'E04': return { records: cached(getStoredTasks, DEMO_TASKS) };
      case 'E09': return { records: cached(getStoredEmails, DEMO_EMAILS) };
      default: return { success: true };
    }
  }

  function getStoredDocuments() { return JSON.parse(localStorage.getItem('dgo_cached_docs') || '[]'); }
  function saveStoredDocuments(docs) { localStorage.setItem('dgo_cached_docs', JSON.stringify(docs)); }
  function getStoredTasks() { return JSON.parse(localStorage.getItem('dgo_cached_tasks') || '[]'); }
  function saveStoredTasks(tasks) { localStorage.setItem('dgo_cached_tasks', JSON.stringify(tasks)); }
  function getStoredEmails() { return JSON.parse(localStorage.getItem('dgo_cached_emails') || '[]'); }
  function saveStoredEmails(emails) { localStorage.setItem('dgo_cached_emails', JSON.stringify(emails)); }

  return {
    Outbox,
    callPA,
    isDemoMode,
    setDemoMode,
    normalizeResponse,
    getEndpoint,
    getSimulation: getMockResponse,
    FLOW_CODES,
    getCustomEndpoints,
    saveCustomEndpoints,
    getStoredDocuments,
    saveStoredDocuments,
    getStoredTasks,
    saveStoredTasks,
    getStoredEmails,
    saveStoredEmails
  };
})();

window.API = API;
