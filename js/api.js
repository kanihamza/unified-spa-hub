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
  const DEADLETTER_KEY = 'dgo_outbox_deadletter';
  const OUTBOX_MAX_ATTEMPTS = 8;
  const LOOKUPS_KEY = 'dgo_cached_lookups';
  let bootState = 'idle'; // idle | loading | ok | error

  // ── Central Flow Endpoint Registry ─────────────────────────────────────────
  const PA_BASE = 'https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows';
  const PA_QS = 'api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0';
  const paUrl = (workflowId, sig) => `${PA_BASE}/${workflowId}/triggers/manual/paths/invoke?${PA_QS}&sig=${sig}`;

  const FLOW_ENDPOINTS = {
    // Startup Fetch-All Data & References Matrix (one call → docs, tasks, emails, references).
    E00: paUrl('4a250f97181b4a28abc1d0fb0f7d4c4d', 'eM0zd03iNHh7yWDWaXc9KRI-brj36NNqCgmZNKao5Wo'),

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
    E17: paUrl('43879c5165de439680055ab4258b3f27', 'zO21cB8Gn-LDklvld-xWtGUuZDvCleHWR6j5N6s5Dyo'), // OTP verify ("Web - OTP Verify")

    // Diagnostics sink (REL-02) — centralized telemetry ingest. Operator-provisioned:
    // empty until a flow URL is set in Settings (dgo_endpoint_E18). No fabricated URL is
    // shipped (FR-031–034); telemetry shipping is a no-op until configured.
    E18: ''
  };

  const WRITE_FLOWS = ['E03', 'E05', 'E06', 'E07', 'E08', 'E10', 'E14'];
  const PAGINATED_FLOWS = ['E02', 'E04', 'E09'];
  const FLOW_CODES = Object.keys(FLOW_ENDPOINTS);

  // ── Environment segregation (INF-01) ────────────────────────────────────────
  // FLOW_ENDPOINTS above is the PRODUCTION registry. Non-prod environments resolve
  // their own (separately-rotated) signatures from ENV_ENDPOINTS, selected centrally
  // by host or an explicit Settings profile (`dgo_env_profile`). Dev/test start EMPTY
  // and inherit prod until ops populate them with their own rotated URLs — no fabricated
  // or sample endpoints are shipped (FR-031–034). This removes the "one credential set
  // for every environment" risk while keeping a single central authority.
  const ENV_ENDPOINTS = { dev: {}, test: {} }; // prod = FLOW_ENDPOINTS
  function detectEnvironment() {
    try {
      const forced = localStorage.getItem('dgo_env_profile');
      if (forced === 'dev' || forced === 'test' || forced === 'prod') return forced;
    } catch {}
    let h = '';
    try { h = (location.hostname || '').toLowerCase(); } catch {}
    if (h === 'localhost' || h === '127.0.0.1' || h === '' || h.endsWith('.local')) return 'dev';
    if (h.includes('staging') || h.includes('test') || h.includes('uat')) return 'test';
    return 'prod';
  }
  const ACTIVE_ENV = detectEnvironment();
  function getEnvironment() { return ACTIVE_ENV; }

  // ── Client-side read cache (per flow, persisted) ────────────────────────────
  const READ_CACHE_FLOWS = ['E02', 'E04', 'E09'];
  const CACHE_PREFIX = 'dgo_cache_';
  const WRITE_INVALIDATES = { E03: ['E02'], E05: ['E04'], E06: ['E04'], E07: ['E04'], E08: ['E04'], E10: ['E04', 'E09'], E14: ['E02'] };
  const cacheKey = (code) => CACHE_PREFIX + code;
  function readCache(code) { try { const raw = localStorage.getItem(cacheKey(code)); return raw ? JSON.parse(raw) : null; } catch { return null; } }
  function writeCache(code, resp) { safeSetItem(cacheKey(code), JSON.stringify(resp)); }
  function invalidate(codes) { (Array.isArray(codes) ? codes : [codes]).forEach(c => { try { localStorage.removeItem(cacheKey(c)); } catch {} }); }
  function isCached(code) { try { return localStorage.getItem(cacheKey(code)) !== null; } catch { return false; } }
  function clearCache() { invalidate(READ_CACHE_FLOWS); }

  // ── Storage with surfaced failures (DATA-01) ────────────────────────────────
  // localStorage is the durable substrate for caches and the write Outbox. A failed
  // write must NOT be swallowed (the prior silent `catch {}` blanked caches invisibly,
  // producing empty pages with no error). On quota pressure we evict the largest read
  // cache and retry once; a persistent failure is surfaced via telemetry + a
  // 'dgo:storage-error' event so the UI/operator can react instead of failing silently.
  function evictLargestCache(exceptKey) {
    let largest = null, largestLen = 0;
    for (const c of READ_CACHE_FLOWS) {
      const k = cacheKey(c);
      if (k === exceptKey) continue;
      try { const v = localStorage.getItem(k); if (v && v.length > largestLen) { largestLen = v.length; largest = k; } } catch {}
    }
    if (largest) { try { localStorage.removeItem(largest); } catch {} return true; }
    return false;
  }
  function safeSetItem(key, value) {
    let ok = false;
    try { localStorage.setItem(key, value); ok = true; }
    catch (e) {
      if (evictLargestCache(key)) { try { localStorage.setItem(key, value); ok = true; } catch {} }
      if (!ok) {
        try { window.dispatchEvent(new CustomEvent('dgo:storage-error', { detail: { key, error: e && e.message } })); } catch {}
        if (window.Telemetry) { try { window.Telemetry.log('storage_write_failed', { key, error: e && e.message }); } catch {} }
      }
    }
    // Continuous monitoring (DATA-01): every write re-checks storage pressure so the
    // localStorage budget is observed at its single mutation chokepoint.
    try { checkStoragePressure(); } catch {}
    return ok;
  }

  // ── Storage-pressure monitor (DATA-01 — explicit, robust, continuous) ───────
  // localStorage has a small (~5 MB) per-origin quota and is the durable substrate for
  // caches + the write outbox. We continuously measure usage so the "IndexedDB migration
  // gate" (and any pre-failure pressure) is an EXPLICIT, monitored signal — surfaced via
  // a public API, the dgo:storage-pressure event, telemetry (shippable via E18), the
  // topbar indicator and the Settings dashboard — rather than an implicit assumption.
  const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024; // conservative localStorage budget (not queryable)
  const STORAGE_THRESHOLDS = { warn: 70, high: 80, critical: 90 }; // % of budget
  function storageCategory(k) {
    if (k === 'dgo_cached_lookups') return 'references';
    if (k.startsWith('dgo_cache_') || k.startsWith('dgo_cached_')) return 'caches';
    if (k === 'dgo_sync_outbox' || k === 'dgo_outbox_deadletter') return 'outbox';
    if (k === 'dgo_telemetry_logs') return 'telemetry';
    if (k === 'dgo_session_user' || k === 'dgo_auth_token') return 'session';
    if (k.startsWith('dgo_endpoint_') || k.startsWith('dgo_')) return 'config';
    return 'other';
  }
  function levelFor(rawPct) {
    if (rawPct >= STORAGE_THRESHOLDS.critical) return 'critical';
    if (rawPct >= STORAGE_THRESHOLDS.high) return 'high';
    if (rawPct >= STORAGE_THRESHOLDS.warn) return 'warn';
    return 'ok';
  }
  function measureStorage() {
    try {
      let used = 0; const breakdown = {};
      const n = localStorage.length;
      for (let i = 0; i < n; i++) {
        const k = localStorage.key(i);
        if (k == null) continue;
        const v = localStorage.getItem(k) || '';
        const bytes = (k.length + v.length) * 2; // UTF-16 code units
        used += bytes;
        const cat = storageCategory(k);
        breakdown[cat] = (breakdown[cat] || 0) + bytes;
      }
      const rawPct = STORAGE_BUDGET_BYTES ? (used / STORAGE_BUDGET_BYTES) * 100 : 0;
      return {
        usedBytes: used, quotaBytes: STORAGE_BUDGET_BYTES,
        percent: Math.min(100, Math.round(rawPct * 10) / 10),
        rawPercent: Math.round(rawPct * 10) / 10,
        level: levelFor(rawPct), breakdown, ts: Date.now()
      };
    } catch {
      return { usedBytes: 0, quotaBytes: STORAGE_BUDGET_BYTES, percent: 0, rawPercent: 0, level: 'ok', breakdown: {}, ts: Date.now() };
    }
  }
  let _lastStorageStats = null;
  let _lastStorageLevel = null;
  function checkStoragePressure(force) {
    const stats = measureStorage();
    _lastStorageStats = stats;
    if (force || stats.level !== _lastStorageLevel) {
      const prev = _lastStorageLevel;
      _lastStorageLevel = stats.level;
      try { window.dispatchEvent(new CustomEvent('dgo:storage-pressure', { detail: stats })); } catch {}
      // Debounced to level changes only (avoid a telemetry-write feedback loop). The
      // high/critical levels are the EXPLICIT IndexedDB-migration gate signal. The benign
      // 'ok' baseline is not logged.
      if (stats.level !== 'ok' && stats.level !== prev && window.Telemetry) {
        try {
          window.Telemetry.log('storage_pressure', {
            level: stats.level, percent: stats.percent, usedKB: Math.round(stats.usedBytes / 1024),
            gate: (stats.level === 'high' || stats.level === 'critical') ? 'indexeddb_migration_recommended' : undefined
          });
        } catch {}
      }
    }
    return stats;
  }
  function getStorageStats() { return _lastStorageStats || checkStoragePressure(true); }
  // Continuous, multi-path monitoring: cross-tab writes + a steady poll (the per-write
  // hook lives in safeSetItem above). All guarded so monitoring can never disrupt the app.
  try { window.addEventListener('storage', () => { try { checkStoragePressure(); } catch {} }); } catch {}
  try { setInterval(() => { try { checkStoragePressure(); } catch {} }, 30000); } catch {}
  try { checkStoragePressure(); } catch {} // establish a baseline at load

  /** Active URL for a flow code: per-flow runtime override (Settings) > per-env central
   *  set (INF-01) > production registry. */
  function getEndpoint(code) {
    try { const override = localStorage.getItem(`dgo_endpoint_${code}`); if (override) return override; } catch {}
    const envSet = ENV_ENDPOINTS[ACTIVE_ENV];
    if (envSet && envSet[code]) return envSet[code];
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
    safeSetItem(LOOKUPS_KEY, JSON.stringify(norm));
    return norm;
  }
  function readLookups() { try { const s = localStorage.getItem(LOOKUPS_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }

  // ── Startup Fetch-All ───────────────────────────────────────────────────────
  // One pass that populates docs/tasks/emails caches and the references cache.
  // Uses the Fetch-All flow (E00) when configured; otherwise fans out to the
  // dedicated read flows. References are loaded here (once on startup).
  let _fetchAllPromise = null;
  function pendingFetchAll() { return _fetchAllPromise; }
  function fetchAll() {
    // Singleton: if a Fetch-All is already in flight, every caller shares it — never
    // launch several at once. (Manual settings refresh also reuses an in-flight run.)
    if (_fetchAllPromise) return _fetchAllPromise;
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
    _processing: null, // single-flight guard (INT-01)
    get: () => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch { return []; } },
    save: (queue) => { safeSetItem(OUTBOX_KEY, JSON.stringify(queue)); },
    // Public queue clear (STR-03) — pages must not poke the private OUTBOX_KEY directly.
    clearQueue() { try { localStorage.removeItem(OUTBOX_KEY); } catch {} },
    // Dead-letter store: writes that exhausted their retries, surfaced for manual review.
    deadGet: () => { try { return JSON.parse(localStorage.getItem(DEADLETTER_KEY) || '[]'); } catch { return []; } },
    deadSave: (q) => { try { localStorage.setItem(DEADLETTER_KEY, JSON.stringify(q)); } catch {} },
    deadLetter(item) { const dl = this.deadGet(); dl.push(item); this.deadSave(dl); },
    getDeadLetter() { return this.deadGet(); },
    discardDeadLetter(id) { this.deadSave(this.deadGet().filter(q => q.id !== id)); },
    retryDeadLetter(id) {
      const dl = this.deadGet();
      const item = dl.find(q => q.id === id);
      if (!item) return false;
      this.deadSave(dl.filter(q => q.id !== id));
      const q = this.get();
      q.push(Object.assign({}, item, { attempts: 0, nextRetry: Date.now() }));
      this.save(q);
      this.process();
      return true;
    },
    async push(code, payload) {
      const queue = this.get();
      const outboxId = `OUTBOX-TX-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      const entry = { id: outboxId, code, payload, timestamp: new Date().toISOString(), attempts: 0, nextRetry: Date.now() };
      queue.push(entry);
      this.save(queue);
      this.process();
      return { success: true, outboxId, status: 'QUEUED_LOCAL' };
    },
    // Single-flight gate (INT-01): concurrent triggers — push(), the `online` event,
    // retryDeadLetter(), callPA() — must NEVER run overlapping passes, or the same item
    // could be POSTed twice (it is removed from the queue only AFTER a 200). All callers
    // share the one in-flight run.
    process() {
      if (this._processing) return this._processing;
      const p = this._processOnce().catch(() => {}).finally(() => { if (this._processing === p) this._processing = null; });
      this._processing = p;
      return p;
    },
    async _processOnce() {
      if (!navigator.onLine) {
        if (window.Chrome) window.Chrome.showToast("Offline mode active. Operations queued.", "warning");
        return;
      }
      let queue = this.get();
      if (queue.length === 0) return;
      const activeQueue = [...queue];
      for (let item of activeQueue) {
        if (item.nextRetry > Date.now()) continue;
        // Bounded write (REL-01): a hung POST must not stall the queue or widen the
        // duplicate-delivery window. Matches the 20s read timeout in doFetch().
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        try {
          const url = getEndpoint(item.code);
          if (!url) { clearTimeout(timeoutId); if (window.Telemetry) window.Telemetry.log("outbox_flow_not_configured", { code: item.code, txId: item.id }); continue; }
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-DGO-Trigger': 'Platform-Outbox-Agent', 'X-DGO-Tx-ID': item.id, 'X-Correlation-ID': item.id },
            body: JSON.stringify(item.payload),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            queue = this.get().filter(q => q.id !== item.id);
            this.save(queue);
            window.dispatchEvent(new CustomEvent('dgo:outbox-delivered', { detail: { code: item.code, id: item.id } }));
            if (window.Chrome) window.Chrome.showToast(`Flow ${item.code} successfully synchronized.`, 'success');
          } else { throw new Error(`Server returned status code: ${response.status}`); }
        } catch (err) {
          clearTimeout(timeoutId);
          item.attempts++;
          if (item.attempts >= OUTBOX_MAX_ATTEMPTS) {
            // Exhausted retries → move to dead-letter so it stops silently retrying and
            // can be surfaced / retried / discarded from Settings (INT-01).
            this.save(this.get().filter(q => q.id !== item.id));
            this.deadLetter(Object.assign({}, item, { lastError: err && err.message, failedAt: new Date().toISOString() }));
            window.dispatchEvent(new CustomEvent('dgo:outbox-failed', { detail: { code: item.code, id: item.id, error: err && err.message } }));
            if (window.Telemetry) window.Telemetry.log('outbox_deadlettered', { code: item.code, txId: item.id, error: err && err.message });
            if (window.Chrome) window.Chrome.showToast(`Flow ${item.code} failed after ${OUTBOX_MAX_ATTEMPTS} attempts — saved to outbox for review.`, 'error');
            continue;
          }
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
    if (WRITE_FLOWS.includes(code)) {
      const res = await Outbox.push(code, payload);
      if (WRITE_INVALIDATES[code]) invalidate(WRITE_INVALIDATES[code]);
      return res;
    }

    // Read flows (docs/tasks/emails/references) are SUBSETS of the Fetch-All superset.
    // Modules NEVER fetch a dedicated read flow — they read the cache populated by the
    // Fetch-All. A forced refresh (opts.force) re-runs the single Fetch-All; otherwise,
    // if the cache is still cold and a Fetch-All is in flight, we wait for it. No
    // dedicated read flow ever runs alongside the Fetch-All.
    if (READ_CACHE_FLOWS.includes(code) || code === 'E01') {
      if (opts.force === true) { try { await fetchAll(); } catch {} }
      else if (_fetchAllPromise) { try { await _fetchAllPromise; } catch {} }
      if (code === 'E01') return readLookups() || normalizeReferences({});
      const cached = readCache(code);
      return cached !== null ? cached : normalizeResponse(code, { records: [] });
    }

    // Non-cached, non-write flows (e.g. OTP E16/E17) — direct call.
    const raw = await doFetch(code, payload);
    return raw == null ? { success: false } : raw;
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
  function showBootError() {
    if (document.getElementById('dgo-boot-error')) return;
    const el = document.createElement('div');
    el.id = 'dgo-boot-error';
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;background:#7f1d1d;color:#fff;font-family:system-ui,"Segoe UI",sans-serif;font-size:13px;padding:10px 16px;box-shadow:0 2px 8px rgba(0,0,0,.3);';
    el.innerHTML =
      '<span>Live data unavailable — could not reach the Power Automate flows (check connectivity / flow CORS).</span>' +
      '<button id="dgo-boot-retry" style="background:#fff;color:#7f1d1d;border:none;border-radius:4px;padding:5px 12px;font-weight:700;cursor:pointer;">Retry</button>' +
      '<button id="dgo-boot-dismiss" aria-label="Dismiss" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:4px;padding:5px 10px;cursor:pointer;">Dismiss</button>';
    (document.body || document.documentElement).appendChild(el);
    const r = document.getElementById('dgo-boot-retry');
    const d = document.getElementById('dgo-boot-dismiss');
    if (r) r.addEventListener('click', retryBoot);
    if (d) d.addEventListener('click', removeBootError);
  }
  function removeBootError() { const el = document.getElementById('dgo-boot-error'); if (el) el.remove(); }

  async function retryBoot() {
    removeBootError();
    showBootOverlay();
    bootState = 'loading';
    try {
      await fetchAll();
      bootState = 'ok';
      try { sessionStorage.setItem('dgo_booted', '1'); } catch {}
      window.dispatchEvent(new CustomEvent('dgo:data-refreshed'));
    } catch (e) {
      bootState = 'error';
      showBootError();
    } finally {
      hideBootOverlay();
    }
  }

  async function boot() {
    // Run the startup Fetch-All once per browser session, behind a loading screen.
    // The guard is set synchronously so navigation during the load cannot launch a
    // second concurrent Fetch-All; on FAILURE we clear it (and show a Retry banner) so
    // the next page load re-attempts instead of stranding the session on empty caches.
    if (sessionStorage.getItem('dgo_booted') === '1') return;
    try { sessionStorage.setItem('dgo_booted', '1'); } catch {}
    showBootOverlay();
    bootState = 'loading';
    try {
      await fetchAll();
      bootState = 'ok';
      // REL-01: notify pages that rendered against a cold cache (e.g. a fast navigation
      // before the Fetch-All resolved) so they re-render in place instead of stranding
      // on an empty state with no recovery.
      try { window.dispatchEvent(new CustomEvent('dgo:data-refreshed')); } catch {}
    } catch (e) {
      bootState = 'error';
      try { sessionStorage.removeItem('dgo_booted'); } catch {}
      if (window.Telemetry) window.Telemetry.log('fetch_all_failed', { error: e && e.message });
      showBootError();
    } finally {
      hideBootOverlay();
    }
  }
  function getBootState() { return bootState; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return {
    Outbox,
    callPA,
    refresh,
    fetchAll,
    pendingFetchAll,
    getBootState,
    getEnvironment,
    getStorageStats,
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
