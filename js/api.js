/* ============================================================
   DGO v2.4 — Secure API Gateway & Outbox Orchestrator
   ------------------------------------------------------------
   SINGLE SOURCE OF TRUTH for every Power Automate HTTP-trigger
   flow endpoint. No other module may define its own flow URLs.
   Live-only: the platform calls the real flows directly; there
   is no demo/sample/mock data anywhere (FR-031..FR-034).
   ============================================================ */

const API = (() => {
  const OUTBOX_KEY = 'dgo_sync_outbox';

  // ── Central Flow Endpoint Registry ─────────────────────────────────────────
  // Flow URLs are embedded in the frontend during the current delivery phase
  // (no proxy/intermediary — BR-006 / FR-015 / FR-016) and centrally managed
  // here. Each URL is built from its workflow id + SAS signature so rotation is
  // a one-line change per flow. Per-flow runtime overrides may be set in Settings.
  const PA_BASE = 'https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows';
  const PA_QS = 'api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0';
  const paUrl = (workflowId, sig) => `${PA_BASE}/${workflowId}/triggers/manual/paths/invoke?${PA_QS}&sig=${sig}`;

  const FLOW_ENDPOINTS = {
    // Read flows
    E01: paUrl('ff455c68e9ac493e858fb984bcfd01fb', 'jajFVxbv67HbcKqvV8h6JBPm9TPG60yDnhRjy9WmpPU'), // References / lookups (officers, departments, categories)
    E02: paUrl('7995c1eb50d94d5daa2780e71391d874', 'G9ti0-fzVRwt8fdGGheNgSrvIoMCcXKEibCaBDci4oE'), // Inbound dossiers / correspondence (GET_DOCS_OPS_2)
    E04: paUrl('37642ba3597f4cf58288cc71b5e6b519', 'hklOSh62A6jmQuhX28NYQMaxlVEG8fC05LVsyVz7YX4'), // Action tasks
    E09: paUrl('3931e2ff995242b6b2c920c8b2209797', 'SV7I2t9wmS0sWBGpHoIKg8I3E8ATk1KFrqrjC9Gih0U'), // Mailbox sync

    // Write / action flows
    E03: paUrl('85c556f10b8244ba9d839a2ebe240b91', '8ikbMhXrOn_L4QRUBF94wiq2swh7GlNVY_GZ5BD5jK0'), // Update dossier status / flag (Subsidiary Doc Actions)
    E05: paUrl('85c556f10b8244ba9d839a2ebe240b91', '8ikbMhXrOn_L4QRUBF94wiq2swh7GlNVY_GZ5BD5jK0'), // Update task progress / acknowledge (Subsidiary Doc Actions)
    E06: paUrl('6b3bad3005b44bf6bced0f8074d3f2ed', '1kJge9P2IOMOLRZOK-cVb3bcDJbuDhbR8x9h0TvHspQ'), // Single task assignment (Create Task)
    E07: paUrl('c43388639d14452faef4ca3042a95b23', 'yST47ItNduW705P1gJu9CDyfa_LKghM8eTP8aBl48iU'), // Uniform bulk broadcast (Bulk Assign)
    E08: paUrl('1154b50e1d17420dadb3b012e7e2a02c', 'Swbi7nJCn3-VSSz4KN1YxHfxFPfO-EUWsF-czBS3zs4'), // AI batch allocator (Bulk Ops Assign)
    E10: paUrl('a942d230337c4ddfa9a386e92bbd048b', 'KAItnmgczUUEDkJQvICwLdfbTZ3IBbPpaPePNqz0A7U'), // Email-to-task directive (Create Task for Email)
    E14: paUrl('bc83d98acf474a088832d78f50085388', '_Co-r3TG6rtP0yGDDJXIM90WD4Wpym2NmR5OyOSsgnY'), // Dynamic Multi-Actions (catch-all; correspondence-tracker writes)

    // Identity / OTP flows
    E16: paUrl('314aaf27593147089b38322e5ca25936', 'OWBIO1ooq0y8Zh9BTPp3sBOQoyVWs_a463FhFUT66fU'), // OTP request ("Web - OTP Generate")
    E17: paUrl('43879c5165de439680055ab4258b3f27', 'zO21cB8Gn-LDklvld-xWtGUuZDvCleHWR6j5N6s5Dyo')  // OTP verify ("Web - OTP Verify")
  };

  const WRITE_FLOWS = ['E03', 'E05', 'E06', 'E07', 'E08', 'E10', 'E14'];
  const PAGINATED_FLOWS = ['E02', 'E04', 'E09'];
  const FLOW_CODES = Object.keys(FLOW_ENDPOINTS);

  /** Active URL for a flow code: per-flow runtime override (Settings) wins over the registry. */
  function getEndpoint(code) {
    const override = localStorage.getItem(`dgo_endpoint_${code}`);
    if (override) return override;
    return FLOW_ENDPOINTS[code] || '';
  }

  // ── Response normalization ──────────────────────────────────────────────────
  // Live flows wrap data in an envelope ({ok,status,timing,docs:[...]}) with
  // PascalCase fields; several pages read a flat {records:[...]} with camelCase
  // fields. Normalize at the gateway so every page works against the live
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
    status: pick(r, 'status', 'assignmentStatus', 'AssignmentStatus') || '',
    assignmentStatus: pick(r, 'assignmentStatus', 'AssignmentStatus', 'status') || '',
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
      role: pick(o, 'role', 'jobTitle', 'AuthorTitle') || '', dsu: pick(o, 'dsu', 'department', 'DSU_KEY') || '',
      email: pick(o, 'email', 'Email') || ''
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
            if (window.Telemetry) window.Telemetry.log("outbox_flow_not_configured", { code: item.code, txId: item.id });
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

    if (WRITE_FLOWS.includes(code)) {
      return await Outbox.push(code, payload);
    }

    const url = getEndpoint(code);
    if (!url) {
      // No live endpoint configured. Return an empty (normalized) result — never sample data.
      if (window.Telemetry) window.Telemetry.log("api_flow_not_configured", { code });
      return normalizeResponse(code, { records: [] });
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

  // Local cache of the last successful live sync (used by pages for offline continuity;
  // empty until a live flow returns data — never seeded with sample content).
  function getStoredDocuments() { return JSON.parse(localStorage.getItem('dgo_cached_docs') || '[]'); }
  function saveStoredDocuments(docs) { localStorage.setItem('dgo_cached_docs', JSON.stringify(docs)); }
  function getStoredTasks() { return JSON.parse(localStorage.getItem('dgo_cached_tasks') || '[]'); }
  function saveStoredTasks(tasks) { localStorage.setItem('dgo_cached_tasks', JSON.stringify(tasks)); }
  function getStoredEmails() { return JSON.parse(localStorage.getItem('dgo_cached_emails') || '[]'); }
  function saveStoredEmails(emails) { localStorage.setItem('dgo_cached_emails', JSON.stringify(emails)); }

  return {
    Outbox,
    callPA,
    normalizeResponse,
    getEndpoint,
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
