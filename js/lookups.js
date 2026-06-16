/* ============================================================
   DGO v2.1 — References and Lookup Cascading Orchestrator
   ============================================================ */

const Lookups = (() => {
  let cachedData = null;

  function isLoaded() {
    return cachedData !== null;
  }

  // Retrieve details or download via Power Automate E01
  async function loadReferences(forceReload = false) {
    if (!forceReload) {
      const stored = localStorage.getItem('dgo_cached_lookups');
      if (stored) {
        try {
          cachedData = JSON.parse(stored);
          if (window.Telemetry) {
            window.Telemetry.log('lookup_load', { source: 'local_cache', recordsCount: cachedData.categories.length });
          }
          return cachedData;
        } catch {
          // parse failed, fetch fresh
        }
      }
    }

    try {
      if (window.Telemetry) {
        window.Telemetry.log('lookup_fetch_start', { forceReload });
      }
      
      const response = await window.API.callPA('E01');
      if (response && response.categories) {
        cachedData = response;
        localStorage.setItem('dgo_cached_lookups', JSON.stringify(response));
        if (window.Telemetry) {
          window.Telemetry.log('lookup_fetch_success', { recordsCount: response.categories.length });
        }
        return cachedData;
      }
      throw new Error("Invalid lookups payload representation received");
    } catch (err) {
      if (window.Telemetry) {
        window.Telemetry.log('lookup_fetch_failure', { error: err.message });
      }
      // Fail-safe: fall back to the gateway's deterministic local simulation
      // payload (synchronous — no live fetch) so selections never render blank.
      cachedData = window.API.getSimulation
        ? window.API.getSimulation('E01')
        : { categories: [], departments: [], officers: [] };
      localStorage.setItem('dgo_cached_lookups', JSON.stringify(cachedData));
      return cachedData;
    }
  }

  // Pre-populate lookups cache immediately to avoid blank selections
  function bootstrapCache() {
    if (!localStorage.getItem('dgo_cached_lookups')) {
      loadReferences(false);
    } else {
      cachedData = JSON.parse(localStorage.getItem('dgo_cached_lookups'));
    }
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
