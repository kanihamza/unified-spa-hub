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
    E02: paUrl('818ec4053f1e4f0b87845114241d8b74', 'MgQUY52IfdIP3MRFR4H1Zz_lNH-lHT6-IJ675Yz5S50'), // Inbound dossiers (OData)
    E04: paUrl('37642ba3597f4cf58288cc71b5e6b519', 'hklOSh62A6jmQuhX28NYQMaxlVEG8fC05LVsyVz7YX4'), // Action tasks (OData)
    E09: paUrl('3931e2ff995242b6b2c920c8b2209797', 'SV7I2t9wmS0sWBGpHoIKg8I3E8ATk1KFrqrjC9Gih0U'), // Mailbox sync (OData)

    // Write / action flows
    // E03/E05/E06 share the unified mutation flow (6b3bad30), differentiated by
    // the payload `action`/`status` fields (matches the source SPA architecture).
    E03: paUrl('6b3bad3005b44bf6bced0f8074d3f2ed', '1kJge9P2IOMOLRZOK-cVb3bcDJbuDhbR8x9h0TvHspQ'), // Update dossier status / flag document
    E05: paUrl('6b3bad3005b44bf6bced0f8074d3f2ed', '1kJge9P2IOMOLRZOK-cVb3bcDJbuDhbR8x9h0TvHspQ'), // Update task progress
    E06: paUrl('6b3bad3005b44bf6bced0f8074d3f2ed', '1kJge9P2IOMOLRZOK-cVb3bcDJbuDhbR8x9h0TvHspQ'), // Single task assignment
    E07: paUrl('c43388639d14452faef4ca3042a95b23', 'yST47ItNduW705P1gJu9CDyfa_LKghM8eTP8aBl48iU'), // Uniform bulk broadcast (Bulk Assign)
    E08: paUrl('1154b50e1d17420dadb3b012e7e2a02c', 'Swbi7nJCn3-VSSz4KN1YxHfxFPfO-EUWsF-czBS3zs4'), // AI batch allocator (Bulk Ops Assign)
    E10: paUrl('a942d230337c4ddfa9a386e92bbd048b', 'KAItnmgczUUEDkJQvICwLdfbTZ3IBbPpaPePNqz0A7U'), // Email-to-task directive (Create Task for Email)
    E14: '', // Reserved — no source flow identified
    E15: '', // Reserved — no source flow identified

    // Identity / OTP flows — OTP disabled this phase (see GOVERNANCE.md)
    E16: '', // OTP request
    E17: ''  // OTP verify
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
    if (WRITE_FLOWS.includes(code)) {
      return await Outbox.push(code, payload);
    }

    const url = getEndpoint(code);
    if (!url) {
      // Unprovisioned flow → deterministic local simulation (dev/offline only).
      if (window.Telemetry) window.Telemetry.log("api_simulation_fallback", { code });
      return getMockResponse(code, payload);
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
      return await response.json();
    } catch (e) {
      clearTimeout(timeoutId);
      if (window.Telemetry) window.Telemetry.log("api_invocation_error", { code, error: e.message });
      throw e;
    }
  }

  /**
   * Deterministic local simulation payloads. Used ONLY when a flow has no
   * configured URL (Settings "simulation" mode / offline dev). This is an
   * explicit, opt-in fallback — not production data. See GOVERNANCE.md.
   */
  function getMockResponse(code, payload) {
    switch (code) {
      case 'E01':
        return {
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
      case 'E02': return { records: getStoredDocuments() };
      case 'E04': return { records: getStoredTasks() };
      case 'E09': return { records: getStoredEmails() };
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
