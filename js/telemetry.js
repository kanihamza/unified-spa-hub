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

    localStorage.setItem('dgo_telemetry_logs', JSON.stringify(logs));
    
    // Broadcast diagnostic event if setting listeners exist
    const evt = new CustomEvent('dgo_telemetry_push', { detail: newLog });
    window.dispatchEvent(evt);
  }

  function clearLogs() {
    localStorage.setItem('dgo_telemetry_logs', JSON.stringify([]));
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
