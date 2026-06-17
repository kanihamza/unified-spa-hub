/* ============================================================
   DGO v2.2 — Session, Theme, & Local Storage Persistence State
   ------------------------------------------------------------
   Identity is LIVE: the active user is either the OTP-authenticated
   session or one selected from the live officer directory (E01
   references). No hardcoded/sample users exist (FR-034).
   ============================================================ */

const State = (() => {
  const USER_KEY = 'dgo_session_user';

  // The active user, or null if none has been selected/authenticated yet.
  function getActiveUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // Live directory of selectable identities, sourced from the references flow (E01).
  function getAllUsers() {
    const officers = (window.Lookups && typeof window.Lookups.getOfficers === 'function')
      ? window.Lookups.getOfficers()
      : [];
    return (officers || []).map(o => ({
      id: o.id,
      name: o.name,
      role: o.role || '',
      roleCode: o.roleCode || deriveRoleCode(o.role),
      dsu: o.dsu || '',
      email: o.email || ''
    }));
  }

  // Best-effort role code from a role title (used only for display/labelling).
  function deriveRoleCode(role) {
    const r = String(role || '').toLowerCase();
    if (r.includes('director general') || /\bdg\b/.test(r)) return 'DG';
    if (r.includes('director')) return 'DIR';
    if (r.includes('support')) return 'SUP';
    if (r.includes('registry')) return 'REG';
    return 'USR';
  }

  // Select/persist the active identity. Accepts an id (resolved against the live
  // directory) or a full user object (e.g. from OTP verification).
  function setActiveUser(idOrUser) {
    let user = null;
    if (idOrUser && typeof idOrUser === 'object') {
      user = idOrUser;
    } else if (idOrUser) {
      user = getAllUsers().find(u => String(u.id) === String(idOrUser)) || null;
    }
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (window.Telemetry) window.Telemetry.log('session_switch', { userId: user.id, userName: user.name });
      return user;
    }
    return getActiveUser();
  }

  function clearActiveUser() {
    localStorage.removeItem(USER_KEY);
  }

  // Visual appearance tokens (theme, density)
  function getVisualSettings() {
    return {
      theme: localStorage.getItem('dgo_theme') || 'light',
      density: localStorage.getItem('dgo_density') || 'comfortable'
    };
  }

  function applyVisualSettings(settings) {
    if (settings.theme) {
      localStorage.setItem('dgo_theme', settings.theme);
      document.documentElement.setAttribute('data-theme', settings.theme);
    }
    if (settings.density) {
      localStorage.setItem('dgo_density', settings.density);
      document.documentElement.setAttribute('data-density', settings.density);
    }
    if (window.Telemetry) {
      window.Telemetry.log('visual_setting_update', settings);
    }
  }

  function initialize() {
    applyVisualSettings(getVisualSettings());
    if (window.Lookups) window.Lookups.bootstrapCache();
  }

  return {
    getActiveUser,
    setActiveUser,
    clearActiveUser,
    getAllUsers,
    getVisualSettings,
    applyVisualSettings,
    initialize
  };
})();

window.State = State;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', State.initialize);
} else {
  State.initialize();
}
