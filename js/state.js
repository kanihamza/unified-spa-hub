/* ============================================================
   DGO v2.1 — Session, Theme, & Local Storage Persistence State
   ============================================================ */

const State = (() => {
  const DEFAULT_USER = {
    id: "U-DG",
    name: "Kashifu Inuwa Abdullahi",
    role: "Director General",
    roleCode: "DG",
    dsu: "DSU01"
  };

  const USERS = [
    { id: "U-DG", name: "Kashifu Inuwa Abdullahi", role: "Director General", roleCode: "DG", dsu: "DSU01" },
    { id: "U-DIR", name: "Salisu Kaka", role: "SGF Directorate Director", roleCode: "DIR", dsu: "DSU04" },
    { id: "U-SUP", name: "John Oke", role: "EGI Support Officer", roleCode: "SUP", dsu: "DSU03" },
    { id: "U-REG", name: "Bala Ibrahim", role: "Registry Staff", roleCode: "REG", dsu: "DSU02" }
  ];

  function getActiveUser() {
    const raw = localStorage.getItem('dgo_session_user');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return DEFAULT_USER;
      }
    }
    return DEFAULT_USER;
  }

  function setActiveUser(userId) {
    const user = USERS.find(u => u.id === userId);
    if (user) {
      localStorage.setItem('dgo_session_user', JSON.stringify(user));
      if (window.Telemetry) {
        window.Telemetry.log('session_switch', { userId, userName: user.name });
      }
      return user;
    }
    return getActiveUser();
  }

  function getAllUsers() {
    return USERS;
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

  // Bootstrap initial attributes
  function initialize() {
    const settings = getVisualSettings();
    applyVisualSettings(settings);
    
    // Ensure lookups cache is populated
    if (window.Lookups) {
      window.Lookups.bootstrapCache();
    }
  }

  return {
    getActiveUser,
    setActiveUser,
    getAllUsers,
    getVisualSettings,
    applyVisualSettings,
    initialize
  };
})();

// Attach to window context
window.State = State;

// Auto-run bootstrap on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', State.initialize);
} else {
  State.initialize();
}
