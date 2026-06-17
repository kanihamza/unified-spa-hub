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
        try { cachedData = JSON.parse(stored); return cachedData; } catch { /* parse failed → reload */ }
      }
      // Not cached yet — wait for the in-flight startup Fetch-All, then read.
      if (window.API && window.API.fetchAll) {
        try { await window.API.fetchAll(false); } catch {}
        const s2 = localStorage.getItem('dgo_cached_lookups');
        if (s2) { try { cachedData = JSON.parse(s2); return cachedData; } catch {} }
      }
      cachedData = cachedData || { categories: [], departments: [], officers: [] };
      return cachedData;
    }

    // Forced refresh (Settings/diagnostics only) — re-run the Fetch-All.
    try {
      if (window.Telemetry) window.Telemetry.log('lookup_refresh_start', {});
      if (window.API && window.API.fetchAll) await window.API.fetchAll(true);
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

    // Determine default CC recipients based on cascade constraints
    const ccCodes = [];
    if (supportDept) ccCodes.push(supportDept.code);
    if (categoryCode === 'CAT_INFRA') ccCodes.push('SGF');
    if (categoryCode === 'CAT_MOU') ccCodes.push('LSD');

    return {
      defaultAssigneeId: cat.defaultAssignee,
      defaultAssigneeName: assignee ? assignee.name : '',
      supportDeptId: cat.supportDSU,
      supportDeptName: supportDept ? supportDept.name : '',
      defaultPriority: cat.defaultPriority || 'MEDIUM',
      defaultCC: ccCodes,
      deadlineDays: categoryCode === 'CAT_INFRA' ? 7 : (categoryCode === 'CAT_MOU' ? 5 : 14)
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
    getCategories,
    getDepartments,
    getOfficers,
    resolveCategoryCascade,
    getPriorityMultiplier
  };
})();

window.Lookups = Lookups;
