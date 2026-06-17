/* ============================================================
   DGO v2.5 — Secure API Gateway, Startup Fetch-All & Outbox
   ------------------------------------------------------------
   SINGLE SOURCE OF TRUTH for every Power Automate HTTP-trigger
   flow endpoint. Live-only: no demo/sample/mock data anywhere.
   On app start, a single Fetch-All loads docs, tasks, emails and
   references in one pass (behind a loading screen); navigation
   then reads the cache. References are loaded once on startup.
   ============================================================ */

const API = (() => {
  const OUTBOX_KEY = 'dgo_sync_outbox';
  const LOOKUPS_KEY = 'dgo_cached_lookups';

  // ── Central Flow Endpoint Registry ─────────────────────────────────────────
  const PA_BASE = 'https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows';
  const PA_QS = 'api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0';
  const paUrl = (workflowId, sig) => `${PA_BASE}/${workflowId}/triggers/manual/paths/invoke?${PA_QS}&sig=${sig}`;

  const FLOW_ENDPOINTS = {
    // Startup Fetch-All Data & References Matrix (one call → docs, tasks, emails, references).
    // Provide its HTTP trigger URL here or in Settings; until then the platform fans out to the
    // dedicated read flows below on startup.
    E00: '',

    // Read flows (dedicated, used for module-level forced refresh + as the startup fallback)
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

  // ── Client-side read cache (per flow, persisted) ────────────────────────────
  const READ_CACHE_FLOWS = ['E02', 'E04', 'E09'];
  const CACHE_PREFIX = 'dgo_cache_';
  const WRITE_INVALIDATES = { E03: ['E02'], E05: ['E04'], E06: ['E04'], E07: ['E04'], E08: ['E04'], E10: ['E04', 'E09'], E14: ['E02'] };
  const cacheKey = (code) => CACHE_PREFIX + code;
  function readCache(code) { try { const raw = localStorage.getItem(cacheKey(code)); return raw ? JSON.parse(raw) : null; } catch { return null; } }
  function writeCache(code, resp) { try { localStorage.setItem(cacheKey(code), JSON.stringify(resp)); } catch {} }
  function invalidate(codes) { (Array.isArray(codes) ? codes : [codes]).forEach(c => { try { localStorage.removeItem(cacheKey(c)); } catch {} }); }
  function isCached(code) { try { return localStorage.getItem(cacheKey(code)) !== null; } catch { return false; } }
  function clearCache() { invalidate(READ_CACHE_FLOWS); }

  /** Active URL for a flow code: per-flow runtime override (Settings) wins over the registry. */
  function getEndpoint(code) {
    const override = localStorage.getItem(`dgo_endpoint_${code}`);
    if (override) return override;
    return FLOW_ENDPOINTS[code] || '';
  }

  // ── Response normalization (aligned to the Fetch-All flow contract) ─────────
  // Fetch-All returns { ok, status, request, timing, data:{docs,tasks,emails,
  // users,categories,departments,taskComments}, errors, meta }. Per-entity flows
  // return the same row shapes under their own key. Normalize so every page works:
  // expose `records` + the entity key, add camelCase aliases, keep originals.
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
    assignee: pick(r, 'assignee', 'AssignedTo', 'Assigned'),
    directives: pick(r, 'directives', 'Description') || '',
    link: pick(r, 'link', 'AttachmentLink') || '',
    routing: pick(r, 'routing', 'RoutedToDSU') || ''
  });
  const aliasTask = (r) => Object.assign({}, r, {
    id: pick(r, 'id', 'ID'), title: pick(r, 'title', 'Title'),
    status: pick(r, 'status', 'Progress', 'Status'),
    priority: pick(r, 'priority', 'Priority'),
    assignee: pick(r, 'assignee', 'AssignedTo', 'Assigned'),
    // In this flow the task `Description` is a BOOLEAN (has-description). Only treat a
    // real string as directives; expose the boolean separately.
    directives: (typeof r.directives === 'string' ? r.directives : '') || '',
    hasDescription: (typeof r.Description === 'boolean' ? r.Description : undefined),
    dueDate: pick(r, 'dueDate', 'DueDate'),
    category: pick(r, 'category', 'Classification', 'Category'),
    refIDD: pick(r, 'refIDD', 'RefIDD', 'Reference_ID'),
    routing: pick(r, 'routing', 'RoutedToDSU', 'AssignedToDSU', 'GDSUROUT') || '',
    lastUpdateNotes: pick(r, 'lastUpdateNotes', 'Comments') || ''
  });
  const aliasEmail = (r) => Object.assign({}, r, {
    id: pick(r, 'id', 'ID'), subject: pick(r, 'subject', 'Subject'),
    sender: pick(r, 'sender', 'fromAddress', 'fromName', (x) => x.from && x.from.emailAddress && x.from.emailAddress.address) || '',
    body: pick(r, 'body', 'bodyContent', 'bodyPreview', (x) => x.body && x.body.content, 'bodyHtml') || '',
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
      code: pick(c, 'code', 'Category Code', 'Category', 'DSU_KEY', (x) => x.ID != null ? String(x.ID) : undefined),
      name: pick(c, 'name', 'Title', 'Category'),
      defaultAssignee: pick(c, 'defaultAssignee', 'Default Primary Responsible'),
      supportDSU: pick(c, 'supportDSU', 'Default Supporting Department/Unit', 'INFORMDSU1'),
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

  // ── Low-level fetch (no caching) ────────────────────────────────────────────
  async function doFetch(code, payload) {
    const url = getEndpoint(code);
    if (!url) return null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-DGO-Trigger': 'Platform-Client', 'X-Correlation-ID': `DGO-TX-${Date.now()}` },
        body: JSON.stringify(payload || {}),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      return await response.json();
    } catch (e) {
      clearTimeout(timeoutId);
      if (window.Telemetry) window.Telemetry.log('api_invocation_error', { code, error: e.message });
      throw e;
    }
  }

  function cacheReferences(refsRaw) {
    const norm = normalizeReferences(refsRaw);
    try { localStorage.setItem(LOOKUPS_KEY, JSON.stringify(norm)); } catch {}
    return norm;
  }

  // ── Startup Fetch-All ───────────────────────────────────────────────────────
  // One pass that populates docs/tasks/emails caches and the references cache.
  // Uses the Fetch-All flow (E00) when configured; otherwise fans out to the
  // dedicated read flows. References are loaded here (once on startup).
  let _fetchAllPromise = null;
  function fetchAll(force = false) {
    if (_fetchAllPromise && !force) return _fetchAllPromise;
    const p = (async () => {
      if (getEndpoint('E00')) {
        const resp = await doFetch('E00', { action: 'Fetch_All', operation: 'read', mode: 'read', source: 'DGO_Platform' });
        const data = (resp && resp.data) || {};
        writeCache('E02', normalizeResponse('E02', { docs: data.docs || [] }));
        writeCache('E04', normalizeResponse('E04', { tasks: data.tasks || [] }));
        writeCache('E09', normalizeResponse('E09', { emails: data.emails || [] }));
        cacheReferences({ data: { users: data.users || [], categories: data.categories || [], departments: data.departments || [] } });
        return data;
      }
      // Fallback: dedicated flows in parallel (until E00 URL is provided).
      const [refs, docs, tasks, emails] = await Promise.allSettled([
        doFetch('E01', { action: 'lookups', operation: 'read', source: 'DGO_Platform' }),
        doFetch('E02', { action: 'getDocs', operation: 'read', source: 'DGO_Platform' }),
        doFetch('E04', { action: 'getTasks', operation: 'read', source: 'DGO_Platform' }),
        doFetch('E09', { action: 'emailsfetch', operation: 'read', source: 'DGO_Platform' })
      ]);
      if (docs.status === 'fulfilled' && docs.value != null) writeCache('E02', normalizeResponse('E02', docs.value));
      if (tasks.status === 'fulfilled' && tasks.value != null) writeCache('E04', normalizeResponse('E04', tasks.value));
      if (emails.status === 'fulfilled' && emails.value != null) writeCache('E09', normalizeResponse('E09', emails.value));
      if (refs.status === 'fulfilled' && refs.value != null) cacheReferences(refs.value);
      return null;
    })();
    _fetchAllPromise = p;
    p.catch(() => {}).finally(() => { if (_fetchAllPromise === p) _fetchAllPromise = null; });
    return p;
  }

  const Outbox = {
    get: () => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch { return []; } },
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
          if (!url) { if (window.Telemetry) window.Telemetry.log("outbox_flow_not_configured", { code: item.code, txId: item.id }); continue; }
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-DGO-Trigger': 'Platform-Outbox-Agent', 'X-DGO-Tx-ID': item.id },
            body: JSON.stringify(item.payload)
          });
          if (response.ok) {
            queue = this.get().filter(q => q.id !== item.id);
            this.save(queue);
            if (window.Chrome) window.Chrome.showToast(`Flow ${item.code} successfully synchronized.`, 'success');
          } else { throw new Error(`Server returned status code: ${response.status}`); }
        } catch (err) {
          item.attempts++;
          const backoff = Math.min(10000 * Math.pow(2, item.attempts), 7200000);
          item.nextRetry = Date.now() + backoff;
          const currentQueue = this.get();
          const target = currentQueue.find(q => q.id === item.id);
          if (target) { target.attempts = item.attempts; target.nextRetry = item.nextRetry; this.save(currentQueue); }
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
      if (endpoints[key]) localStorage.setItem(`dgo_endpoint_${key}`, endpoints[key]);
      else localStorage.removeItem(`dgo_endpoint_${key}`);
    }
  }

  async function callPA(code, payload = {}, opts = {}) {
    if (PAGINATED_FLOWS.includes(code)) payload.pagination = payload.pagination || { top: 50, skip: 0 };

    if (WRITE_FLOWS.includes(code)) {
      const res = await Outbox.push(code, payload);
      if (WRITE_INVALIDATES[code]) invalidate(WRITE_INVALIDATES[code]);
      return res;
    }

    // Serve cached read data unless an explicit refresh is requested (opts.force).
    if (READ_CACHE_FLOWS.includes(code) && opts.force !== true) {
      let cached = readCache(code);
      if (cached !== null) return cached;
      // Cold cache: if the startup Fetch-All is in flight, wait for it rather than fetch again.
      if (_fetchAllPromise) { try { await _fetchAllPromise; } catch {} cached = readCache(code); if (cached !== null) return cached; }
    }

    const raw = await doFetch(code, payload);
    if (raw == null) {
      if (window.Telemetry) window.Telemetry.log("api_flow_not_configured", { code });
      return normalizeResponse(code, { records: [] });
    }
    const normalized = normalizeResponse(code, raw);
    if (READ_CACHE_FLOWS.includes(code)) writeCache(code, normalized);
    return normalized;
  }

  function refresh(code, payload) { return callPA(code, payload || {}, { force: true }); }

  // Local write-through store (used by some pages for optimistic edits; empty until
  // a live flow / fetch-all populates it — never seeded with sample content).
  function getStoredDocuments() { try { return JSON.parse(localStorage.getItem('dgo_cached_docs') || '[]'); } catch { return []; } }
  function saveStoredDocuments(docs) { localStorage.setItem('dgo_cached_docs', JSON.stringify(docs)); }
  function getStoredTasks() { try { return JSON.parse(localStorage.getItem('dgo_cached_tasks') || '[]'); } catch { return []; } }
  function saveStoredTasks(tasks) { localStorage.setItem('dgo_cached_tasks', JSON.stringify(tasks)); }
  function getStoredEmails() { try { return JSON.parse(localStorage.getItem('dgo_cached_emails') || '[]'); } catch { return []; } }
  function saveStoredEmails(emails) { localStorage.setItem('dgo_cached_emails', JSON.stringify(emails)); }

  // ── Startup boot: loading screen + Fetch-All (once per browser session) ─────
  function showBootOverlay() {
    if (document.getElementById('dgo-boot-overlay')) return;
    const el = document.createElement('div');
    el.id = 'dgo-boot-overlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#0b3d2e;color:#fff;font-family:system-ui,"Segoe UI",sans-serif;transition:opacity .4s ease;';
    el.innerHTML =
      '<img src="assets/logo/white-out.svg" alt="" style="height:46px;width:auto;opacity:.95;">' +
      '<div style="width:42px;height:42px;border:4px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:dgo-spin 1s linear infinite;"></div>' +
      '<div style="font-size:14px;font-weight:600;letter-spacing:.02em;">Loading platform data…</div>' +
      '<style>@keyframes dgo-spin{to{transform:rotate(360deg)}}</style>';
    (document.body || document.documentElement).appendChild(el);
  }
  function hideBootOverlay() {
    const el = document.getElementById('dgo-boot-overlay');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 450);
  }
  function boot() {
    // Run the startup Fetch-All once per browser session, behind a loading screen.
    if (sessionStorage.getItem('dgo_booted') === '1') return;
    showBootOverlay();
    fetchAll(true).catch(() => {}).finally(() => {
      try { sessionStorage.setItem('dgo_booted', '1'); } catch {}
      hideBootOverlay();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return {
    Outbox,
    callPA,
    refresh,
    fetchAll,
    invalidate,
    isCached,
    clearCache,
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
