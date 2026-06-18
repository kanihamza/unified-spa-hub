/* ============================================================
   DGO v2.1 — References and Lookup Cascading Orchestrator
   ============================================================ */

const Lookups = (() => {
  let cachedData = null;

  function isLoaded() {
    return cachedData !== null;
  }

  // References are loaded ONCE on startup as part of the Fetch-All (api.js). They are
  // mostly static; a manual refresh (Settings/diagnostics) re-runs the Fetch-All.
  async function loadReferences(forceReload = false) {
    if (!forceReload) {
      const stored = localStorage.getItem('dgo_cached_lookups');
      if (stored) {
        try { cachedData = JSON.parse(stored); return cachedData; } catch { /* parse failed → wait below */ }
      }
      // Not cached yet — AWAIT the in-flight startup Fetch-All (do NOT start another).
      const pending = (window.API && window.API.pendingFetchAll) ? window.API.pendingFetchAll() : null;
      if (pending) {
        try { await pending; } catch {}
        const s2 = localStorage.getItem('dgo_cached_lookups');
        if (s2) { try { cachedData = JSON.parse(s2); return cachedData; } catch {} }
      }
      cachedData = cachedData || { categories: [], departments: [], officers: [] };
      return cachedData;
    }

    // Forced refresh (Settings/diagnostics only) — re-run the Fetch-All.
    try {
      if (window.Telemetry) window.Telemetry.log('lookup_refresh_start', {});
      if (window.API && window.API.fetchAll) await window.API.fetchAll();
      const s = localStorage.getItem('dgo_cached_lookups');
      if (s) { cachedData = JSON.parse(s); if (window.Telemetry) window.Telemetry.log('lookup_refresh_success', { recordsCount: (cachedData.categories || []).length }); return cachedData; }
      throw new Error('No references returned');
    } catch (err) {
      if (window.Telemetry) window.Telemetry.log('lookup_refresh_failure', { error: err.message });
      cachedData = cachedData || { categories: [], departments: [], officers: [] };
      return cachedData;
    }
  }

  // Pre-populate the in-memory lookups from the persisted cache (set by the Fetch-All).
  function bootstrapCache() {
    const stored = localStorage.getItem('dgo_cached_lookups');
    if (stored) { try { cachedData = JSON.parse(stored); } catch { cachedData = null; } }
  }

  // Public cache clear (STR-03) — owns the lookups key so other modules/pages do not
  // reach into 'dgo_cached_lookups' directly.
  function clearCache() {
    cachedData = null;
    try { localStorage.removeItem('dgo_cached_lookups'); } catch {}
  }

  function getCategories() {
    return cachedData?.categories || [];
  }

  function getDepartments() {
    return cachedData?.departments || [];
  }

  function getOfficers() {
    return cachedData?.officers || [];
  }

  // Look up cascade definition
  function resolveCategoryCascade(categoryCode) {
    const categories = getCategories();
    const cat = categories.find(c => c.code === categoryCode);
    if (!cat) return null;

    const officers = getOfficers();
    const depts = getDepartments();

    const assignee = officers.find(o => o.id === cat.defaultAssignee) || null;
    const supportDept = depts.find(d => d.id === cat.supportDSU) || null;

    // Default CC recipients are derived from the live reference record (supporting DSU
    // plus any additional CC codes the category itself defines) — no hardcoded per-category
    // rules / category codes (DATA-02).
    const ccCodes = [];
    if (supportDept && supportDept.code) ccCodes.push(supportDept.code);
    const extraCC = cat.defaultCC || cat.ccCodes;
    if (Array.isArray(extraCC)) {
      extraCC.forEach(c => { if (c && !ccCodes.includes(c)) ccCodes.push(c); });
    } else if (typeof extraCC === 'string' && extraCC.trim()) {
      extraCC.split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(c => { if (!ccCodes.includes(c)) ccCodes.push(c); });
    }

    const deadlineDays = Number(cat.deadlineDays || cat.slaDays) || 14;

    return {
      defaultAssigneeId: cat.defaultAssignee,
      defaultAssigneeName: assignee ? assignee.name : '',
      supportDeptId: cat.supportDSU,
      supportDeptName: supportDept ? supportDept.name : '',
      defaultPriority: cat.defaultPriority || 'MEDIUM',
      defaultCC: ccCodes,
      deadlineDays
    };
  }

  function getPriorityMultiplier(priority) {
    switch (priority) {
      case 'HIGH': return 2.5;
      case 'MEDIUM': return 1.5;
      default: return 1.0;
    }
  }

  return {
    isLoaded,
    loadReferences,
    bootstrapCache,
    clearCache,
    getCategories,
    getDepartments,
    getOfficers,
    resolveCategoryCascade,
    getPriorityMultiplier
  };
})();

window.Lookups = Lookups;
