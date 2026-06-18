/* ============================================================
   DGO v2.1 — Central Station Diagnostics Telemetry Logs
   ============================================================ */

const Telemetry = (() => {
  const MAX_LOGS = 100;
  
  function getLogs() {
    try {
      const raw = localStorage.getItem('dgo_telemetry_logs');
      return raw ? JSON.parse(raw) : [];
    } catch {
      // Corrupted store must not cascade into every log() call (OBS-01).
      return [];
    }
  }

  // Persist guarded against quota/disabled storage (DATA-03): a logging write must never
  // throw out of log(). On failure, drop the oldest half and retry once, else give up quietly.
  function safeStore(logs) {
    try { localStorage.setItem('dgo_telemetry_logs', JSON.stringify(logs)); return true; }
    catch {
      try { localStorage.setItem('dgo_telemetry_logs', JSON.stringify(logs.slice(0, Math.floor(MAX_LOGS / 2)))); return true; } catch { return false; }
    }
  }

  function log(actionName, details = {}) {
    const logs = getLogs();
    const newLog = {
      timestamp: new Date().toISOString(),
      action: actionName,
      details: details,
      userId: window.State ? window.State.getActiveUser()?.id : 'system'
    };

    logs.unshift(newLog); // Put new at top

    // Cap array size
    if (logs.length > MAX_LOGS) {
      logs.pop();
    }

    safeStore(logs);

    // Broadcast diagnostic event if setting listeners exist
    const evt = new CustomEvent('dgo_telemetry_push', { detail: newLog });
    window.dispatchEvent(evt);

    flush(); // opportunistic, throttled, best-effort ship to the diagnostics sink (REL-02)
  }

  // Optional centralized diagnostics sink (REL-02): ship the local buffer to the E18
  // flow when an operator has provisioned it (Settings → dgo_endpoint_E18). No-op (and
  // never disruptive) until configured; throttled and fully best-effort.
  let _lastFlush = 0;
  let _flushing = false;
  async function flush(force = false) {
    try {
      if (_flushing) return;
      if (!navigator.onLine) return;
      const url = (window.API && typeof window.API.getEndpoint === 'function') ? window.API.getEndpoint('E18') : '';
      if (!url) return;
      const now = Date.now();
      if (!force && (now - _lastFlush) < 30000) return; // throttle: ≤ 1 ship / 30s
      const logs = getLogs();
      if (!logs.length) return;
      _lastFlush = now; _flushing = true;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-DGO-Trigger': 'Platform-Telemetry', 'X-Correlation-ID': `DGO-DIAG-${now}` },
        body: JSON.stringify({ source: 'DGO_Platform', count: logs.length, logs })
      });
    } catch { /* diagnostics shipping must never disrupt the app */ }
    finally { _flushing = false; }
  }

  function clearLogs() {
    safeStore([]);
    log('telemetry_clear', { message: 'All diagnostics data flushed.' });
  }

  // Get performance statistics summary
  function getSummary() {
    const logs = getLogs();
    return {
      totalActions: logs.length,
      apiRequestsCount: logs.filter(l => l.action.startsWith('api_')).length,
      errorsCount: logs.filter(l => l.action.toLowerCase().includes('error')).length,
      switchCount: logs.filter(l => l.action === 'session_switch').length
    };
  }

  return {
    getLogs,
    log,
    clearLogs,
    flush,
    getSummary
  };
})();

window.Telemetry = Telemetry;

// Log page load latency duration
window.addEventListener('load', () => {
  setTimeout(() => {
    const perf = window.performance?.timing;
    if (perf) {
      const loadTime = perf.loadEventEnd - perf.navigationStart;
      Telemetry.log('page_load', {
        page: window.location.pathname.substring(window.location.pathname.lastIndexOf('/') + 1) || 'index.html',
        durationMs: loadTime > 0 ? loadTime : 'N/A'
      });
    }
  }, 100);
});
