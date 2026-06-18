/* ============================================================
   DGO v2.1 — Cross-Module Global Layout & Chrome Orchestrator
   ============================================================ */

const Chrome = (() => {
  const NAV_ITEMS = [
    { code: 'home', label: 'Home Dashboard', url: 'index.html', icon: 'i-home' },
    { code: 'docs', label: 'Dossiers & Documents', url: 'docs.html', icon: 'i-file' },
    { code: 'assign', label: 'Action Assignment', url: 'assign.html', icon: 'i-plus' },
    { code: 'bulk', label: 'Bulk Ops Assign', url: 'bulk-assign.html', icon: 'i-plus' },
    { code: 'tasks', label: 'Task Tracker', url: 'tasks.html', icon: 'i-check-circle' },
    { code: 'emails', label: 'Email Client Sync', url: 'emails.html', icon: 'i-mail' },
    { code: 'lookup', label: 'Executive Lookup', url: 'lookup.html', icon: 'i-search' },
    { code: 'movement', label: 'File Movement', url: 'registry-movement.html', icon: 'i-file' },
    { code: 'response', label: 'Response Ledger (Cross-Match)', url: 'response-track.html', icon: 'i-chart' },
    { code: 'response-track', label: 'Acknowledgement Tracking', url: 'response-tracking.html', icon: 'i-eye' },
    { code: 'response-matrix', label: 'Response Matrix (SLA)', url: 'response-matrix.html', icon: 'i-grid' },
    { code: 'aid', label: 'AID Dashboard', url: 'aid-dashboard.html', icon: 'i-globe' },
    { code: 'reports', label: 'GTQ Reports', url: 'reports.html', icon: 'i-folder' },
    { code: 'dgceo-hub', label: 'DGCEO Decision Hub', url: 'dgceo-hub.html', icon: 'i-shield' },
    { code: 'dgceo-tracker', label: 'DGCEO Tracker', url: 'dgceo-tracker.html', icon: 'i-folder' },
    { code: 'exec-hub', label: 'Executive Ops Hub', url: 'exec-hub.html', icon: 'i-building' },
    { code: 'fast-track', label: 'Fast-Track Correlation', url: 'fast-track.html', icon: 'i-sparkle' },
    { code: 'settings', label: 'Settings & Station', url: 'settings.html', icon: 'i-settings' }
  ];

  function bootstrap(activeCode) {
    setupActionDispatcher();
    injectSidebar(activeCode);
    injectTopBar(activeCode);
    setupCommandPalette();
    setupMobileMenu();
    injectToastContainer();
    refreshIdentity();
    setupConnIndicator();
  }

  // Connectivity indicator (REL-02): reflect live flow/connection state in the topbar so
  // an outage is visible at a glance (the boot error banner only shows on first-load fail).
  function updateConnIndicator() {
    const el = document.getElementById('dgo-conn-indicator');
    if (!el) return;
    let state = 'loading', title = 'Connecting…';
    if (!navigator.onLine) { state = 'error'; title = 'Offline — operations are queued'; }
    else if (window.API && typeof window.API.getBootState === 'function') {
      const b = window.API.getBootState();
      if (b === 'ok') { state = 'ok'; title = 'Live — connected to flows'; }
      else if (b === 'error') { state = 'error'; title = 'Live data unavailable — check connectivity / flow CORS'; }
    }
    el.setAttribute('data-state', state);
    el.title = title;
  }
  // Storage-pressure indicator (DATA-01): topbar dot shown only under pressure (warn+),
  // plus a one-time toast when crossing into high/critical (the explicit IndexedDB gate).
  let _lastStorageToast = null;
  function updateStorageIndicator(stats) {
    const el = document.getElementById('dgo-storage-indicator');
    if (!el) return;
    stats = stats || (window.API && window.API.getStorageStats ? window.API.getStorageStats() : null);
    if (!stats) return;
    if (stats.level === 'ok') { el.hidden = true; return; }
    el.hidden = false;
    el.setAttribute('data-state', stats.level);
    el.title = `Local storage ${stats.percent}% used (${stats.level}) — caches/diagnostics approaching the on-device limit`;
    if ((stats.level === 'high' || stats.level === 'critical') && stats.level !== _lastStorageToast) {
      showToast(`Local storage ${stats.percent}% full — caches/diagnostics nearing the on-device limit.`, stats.level === 'critical' ? 'error' : 'warning');
    }
    _lastStorageToast = stats.level;
  }

  let _connWired = false;
  function setupConnIndicator() {
    updateConnIndicator();
    updateStorageIndicator();
    if (_connWired) return; _connWired = true;
    ['dgo:data-refreshed', 'dgo:storage-error', 'online', 'offline'].forEach((evt) =>
      window.addEventListener(evt, updateConnIndicator));
    window.addEventListener('dgo:storage-pressure', (e) => updateStorageIndicator(e.detail));
    setInterval(updateConnIndicator, 15000);
  }

  // ── Centralized declarative action dispatcher (SEC-03) ──────────────────────
  // Replaces inline on* handlers (which forced CSP 'unsafe-inline') with a single
  // delegated listener. Markup uses data-act="fn" (dotted paths like "Chrome.refreshData"
  // are resolved on window), with args via data-arg (single, coerced) or data-args (JSON
  // array). Forms opting out of submit use data-nosubmit; <select>/<input> use
  // data-act-change. Delegation covers dynamically-injected elements too.
  function resolveFn(path) {
    if (!path) return null;
    let ctx = window;
    for (const part of String(path).split('.')) { if (ctx == null) return null; ctx = ctx[part]; }
    return typeof ctx === 'function' ? ctx.bind(path.includes('.') ? resolveOwner(path) : window) : null;
  }
  function resolveOwner(path) {
    const parts = String(path).split('.'); let ctx = window;
    for (let i = 0; i < parts.length - 1; i++) { if (ctx == null) return window; ctx = ctx[parts[i]]; }
    return ctx || window;
  }
  function coerceArg(v) {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v !== '' && v != null && !isNaN(v)) return Number(v);
    return v;
  }
  function dispatchAction(el, evt) {
    const fn = resolveFn(el.dataset.act);
    if (!fn) return;
    let args = [];
    if (el.dataset.args != null) { try { args = JSON.parse(el.dataset.args); } catch { args = [el.dataset.args]; } }
    else if (el.dataset.arg != null) { args = [coerceArg(el.dataset.arg)]; }
    fn(...args);
  }
  let _dispatcherReady = false;
  function setupActionDispatcher() {
    if (_dispatcherReady) return; _dispatcherReady = true;
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-act]');
      if (el) dispatchAction(el, e);
    });
    document.addEventListener('submit', (e) => {
      const f = e.target.closest && e.target.closest('[data-nosubmit],[data-act-submit]');
      if (!f) return;
      e.preventDefault();
      if (f.dataset.actSubmit) { const fn = resolveFn(f.dataset.actSubmit); if (fn) fn(e); }
    });
    document.addEventListener('change', (e) => {
      const el = e.target.closest && e.target.closest('[data-act-change]');
      if (!el) return;
      const fn = resolveFn(el.dataset.actChange);
      if (fn) fn(el.value, el);
    });
  }

  function userLabel(u) { return (u && u.role ? u.role : '') + (u && u.roleCode ? ' (' + u.roleCode + ')' : ''); }
  function userInitials(u) { return (u && u.name) ? u.name.split(' ').map(n => n[0]).slice(0, 2).join('') : '?'; }

  // The live officer directory (E01) loads asynchronously; once available, re-render the
  // identity switcher options and the topbar user. No hardcoded users are ever shown.
  async function refreshIdentity() {
    try {
      if (window.Lookups && typeof window.Lookups.loadReferences === 'function') {
        await window.Lookups.loadReferences();
      }
    } catch { /* live directory unavailable — switcher stays empty */ }

    const user = window.State.getActiveUser();
    const select = document.getElementById('identity-switcher');
    if (select) {
      const users = window.State.getAllUsers();
      select.innerHTML = `<option value="" ${!user ? 'selected' : ''} disabled>Select identity…</option>` +
        users.map(u => `<option value="${Sanitizer.escape(u.id)}" ${user && String(u.id) === String(user.id) ? 'selected' : ''}>${Sanitizer.escape(u.name)}${u.roleCode ? ' (' + Sanitizer.escape(u.roleCode) + ')' : ''}</option>`).join('');
    }
    const nameEl = document.getElementById('userbox-name');
    const roleEl = document.getElementById('userbox-role');
    const avEl = document.getElementById('avatar-circle');
    if (nameEl) nameEl.textContent = user && user.name ? user.name : 'Select User';
    if (roleEl) roleEl.textContent = user ? userLabel(user).trim() || 'Identified' : 'Not identified';
    if (avEl) avEl.textContent = userInitials(user);
  }

  // Inject sidebar navigation dynamically
  function injectSidebar(activeCode) {
    const sidebarEl = document.getElementById('dgo-sidebar-placeholder');
    if (!sidebarEl) return;

    const user = window.State.getActiveUser();
    const users = window.State.getAllUsers();

    // Compile navigations list markup
    const navMarkup = NAV_ITEMS.map(item => `
      <a class="dgo-sidebar-nav__link ${item.code === activeCode ? 'dgo-sidebar-nav__link--active' : ''}" href="${item.url}" id="nav-link-${item.code}">
        <svg aria-hidden="true"><use href="assets/icons/sprite.svg#${item.icon}"></use></svg>
        <span>${item.label}</span>
      </a>
    `).join('');

    // Compile active identity switcher markup (live officer directory; no hardcoded users)
    const userOptions = `<option value="" ${!user ? 'selected' : ''} disabled>Select identity…</option>` +
      users.map(u => `
      <option value="${Sanitizer.escape(u.id)}" ${user && String(u.id) === String(user.id) ? 'selected' : ''}>${Sanitizer.escape(u.name)}${u.roleCode ? ' (' + Sanitizer.escape(u.roleCode) + ')' : ''}</option>
    `).join('');

    sidebarEl.outerHTML = `
      <aside class="dgo-sidebar dgo-no-print" id="platform-sidebar" aria-label="Primary Navigation">
        <div class="dgo-sidebar__logo">
          <img src="assets/logo/white-out.svg" alt="DGO Digital Ops Logo" style="height: 38px; width: auto;" id="logo-sidebar">
        </div>
        
        <nav class="dgo-sidebar-nav" aria-label="Main Navigation">
          ${navMarkup}
        </nav>
        
        <div class="dgo-spacer"></div>
        
        <!-- Shared Identity Switcher Harness -->
        <div class="dgo-stack dgo-stack--1" style="border-top: 1px solid rgba(255,255,255,0.15); padding-top: var(--dgo-s-4);">
          <label for="identity-switcher" class="dgo-label" style="color: rgba(255,255,255,0.6); font-size: 10px; text-transform: uppercase;">Identity Box</label>
          <select id="identity-switcher" class="dgo-select" style="background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); color: #ffffff; height: 32px; font-size: var(--dgo-type-body-sm); padding-inline: var(--dgo-s-2);">
            ${userOptions}
          </select>
        </div>
      </aside>
    `;

    // Bind identity switch handler
    setTimeout(() => {
      const select = document.getElementById('identity-switcher');
      if (select) {
        select.addEventListener('change', (e) => {
          if (!e.target.value) return;
          window.State.setActiveUser(e.target.value);
          showToast('Active identity set.', 'success');
          setTimeout(() => window.location.reload(), 400);
        });
      }
    }, 100);
  }

  // Inject top header dynamically
  function injectTopBar(activeCode) {
    const topBarEl = document.getElementById('dgo-topbar-placeholder');
    if (!topBarEl) return;

    const activeItem = NAV_ITEMS.find(n => n.code === activeCode);
    const title = activeItem ? activeItem.label : 'NITDA Hub';
    const user = window.State.getActiveUser();

    topBarEl.outerHTML = `
      <header class="dgo-topbar dgo-no-print" aria-label="Header Utilities">
        <div class="dgo-cluster dgo-cluster--density">
          <button class="dgo-mobile-menu-btn" id="mobile-sidebar-toggle" aria-label="Open navigation menu">
            <svg style="width:20px; height:20px;"><use href="assets/icons/sprite.svg#i-menu"></use></svg>
          </button>
          <h1 class="dgo-h3" style="font-size: var(--dgo-type-h4);" id="topbar-page-title">${Sanitizer.escape(title)}</h1>
        </div>

        <div class="dgo-cluster dgo-cluster--density">
          <!-- Connectivity indicator (REL-02): live flow/connection status -->
          <span id="dgo-conn-indicator" class="dgo-conn-dot" data-state="loading" title="Connecting…" aria-label="Connectivity status" role="status"></span>
          <!-- Storage-pressure indicator (DATA-01): shown only under pressure (warn+) -->
          <span id="dgo-storage-indicator" class="dgo-storage-dot" data-state="ok" title="Storage" aria-label="Local storage usage" role="status" hidden></span>
          <!-- Global data refresh: re-runs the single Fetch-All (superset) for every module -->
          <button class="dgo-btn dgo-btn--sm dgo-btn--outline" style="border-radius: var(--dgo-r-pill);" data-act="Chrome.refreshData" id="btn-global-refresh" aria-label="Refresh all data" title="Refresh data (re-runs the Fetch-All)">
            <svg style="width:14px; height:14px;"><use href="assets/icons/sprite.svg#i-refresh"></use></svg>
            <span style="font-size: 11px;">Refresh</span>
          </button>
          <!-- Command palette trigger suggestion -->
          <button class="dgo-btn dgo-btn--sm dgo-btn--outline" style="border-radius: var(--dgo-r-pill);" data-act="Chrome.showCommandPalette" aria-label="Open Command Box">
            <svg style="width:14px; height:14px;"><use href="assets/icons/sprite.svg#i-search"></use></svg>
            <span style="font-size: 11px;">Search <kbd style="font-family: var(--dgo-family-mono); background: var(--dgo-color-surface-sunken); padding-inline: 4px; border-radius: 2px;">Ctrl+K</kbd></span>
          </button>

          <div class="dgo-userbox">
            <div class="dgo-userbox__avatar" id="avatar-circle">
              ${Sanitizer.escape(userInitials(user))}
            </div>
            <div class="dgo-userbox__info">
              <span class="dgo-userbox__name" id="userbox-name">${Sanitizer.escape(user && user.name ? user.name : 'Select User')}</span>
              <span class="dgo-userbox__role" id="userbox-role">${Sanitizer.escape(user ? (userLabel(user).trim() || 'Identified') : 'Not identified')}</span>
            </div>
          </div>
        </div>
      </header>
    `;
  }

  // Inject toast service container once
  function injectToastContainer() {
    if (!document.getElementById('dgo-global-toast-container')) {
      const container = document.createElement('div');
      container.id = 'dgo-global-toast-container';
      container.className = 'dgo-toast-container dgo-no-print';
      document.body.appendChild(container);
    }
  }

  // Toast notifier
  function showToast(message, type = 'success') {
    const container = document.getElementById('dgo-global-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `dgo-toast dgo-toast--${type}`;
    
    let iconName = 'i-check-circle';
    if (type === 'error') iconName = 'i-alert';
    if (type === 'warning') iconName = 'i-warning';

    toast.innerHTML = `
      <svg style="width:20px; height:20px; flex-shrink:0;"><use href="assets/icons/sprite.svg#${iconName}"></use></svg>
      <div>
        <p style="font-size: var(--dgo-type-body-sm); font-weight: var(--dgo-wt-600); margin-bottom: 2px;">${Sanitizer.escape(message)}</p>
      </div>
    `;

    container.appendChild(toast);
    
    // Auto remove after 3s
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity var(--dgo-dur-fast) var(--dgo-ease-exit)';
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  }

  // Dynamic mobile menu responsive drawer bindings
  function setupMobileMenu() {
    setTimeout(() => {
      const toggleBtn = document.getElementById('mobile-sidebar-toggle');
      const sidebar = document.getElementById('platform-sidebar');
      if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          sidebar.classList.toggle('dgo-sidebar--open');
        });
        
        // Inside click blocker
        document.addEventListener('click', (e) => {
          if (!sidebar.contains(e.target) && sidebar.classList.contains('dgo-sidebar--open')) {
            sidebar.classList.remove('dgo-sidebar--open');
          }
        });
      }
    }, 150);
  }

  // Ctrl+K Command Palette Modal Overlay
  function setupCommandPalette() {
    const parent = document.createElement('div');
    parent.id = 'dgo-cmdk-overlay';
    parent.className = 'dgo-modal-overlay dgo-no-print';
    parent.setAttribute('role', 'dialog');
    parent.setAttribute('aria-modal', 'true');
    parent.setAttribute('aria-label', 'System Command Palette');

    parent.innerHTML = `
      <div class="dgo-cmdk" id="cmdk-body">
        <div class="dgo-cmdk__input-wrapper">
          <svg><use href="assets/icons/sprite.svg#i-search"></use></svg>
          <input type="text" class="dgo-cmdk__input" id="cmdk-search-input" placeholder="Type a destination or shortcut..." autocomplete="off">
        </div>
        <div class="dgo-cmdk__results" id="cmdk-results-list">
          <!-- Dynamic options loaded -->
        </div>
        <div class="dgo-cmdk__footer">
          <span>Target shortcuts with arrows &amp; Enter</span>
          <div class="dgo-cmdk__shortcuts-list">
            <span class="dgo-cmdk__shortcut-indicator"><kbd class="dgo-cmdk__item-shortcut">↑↓</kbd> Navigate</span>
            <span class="dgo-cmdk__shortcut-indicator"><kbd class="dgo-cmdk__item-shortcut">Enter</kbd> Go</span>
            <span class="dgo-cmdk__shortcut-indicator"><kbd class="dgo-cmdk__item-shortcut">Esc</kbd> Close</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(parent);

    // Filter index list
    const items = [
      { text: 'Go to Home Dashboard', url: 'index.html', icon: 'i-home', cat: 'Navigation' },
      { text: 'Go to Dossiers & Documents', url: 'docs.html', icon: 'i-file', cat: 'Navigation' },
      { text: 'Assign a Document/Activity', url: 'assign.html', icon: 'i-plus', cat: 'Navigation' },
      { text: 'Bulk Operations Assign', url: 'bulk-assign.html', icon: 'i-plus', cat: 'Navigation' },
      { text: 'Go to Tasks Tracker', url: 'tasks.html', icon: 'i-check-circle', cat: 'Navigation' },
      { text: 'Go to Email Client', url: 'emails.html', icon: 'i-mail', cat: 'Navigation' },
      { text: 'Go to Executive Lookup Console', url: 'lookup.html', icon: 'i-search', cat: 'Navigation' },
      { text: 'Go to File Movement Sheet', url: 'registry-movement.html', icon: 'i-file', cat: 'Navigation' },
      { text: 'Response Ledger (Cross-Match)', url: 'response-track.html', icon: 'i-chart', cat: 'Navigation' },
      { text: 'Acknowledgement Tracking', url: 'response-tracking.html', icon: 'i-eye', cat: 'Navigation' },
      { text: 'Response Matrix (SLA view)', url: 'response-matrix.html', icon: 'i-grid', cat: 'Navigation' },
      // ack.html is an intentional deep-link landing page (ack.html?taskId=…) reached from
      // task/email notifications — not a top-level destination, so it is not listed here (STR-02).
      { text: 'Go to AID Dashboard', url: 'aid-dashboard.html', icon: 'i-globe', cat: 'Navigation' },
      { text: 'Go to GTQ Reports', url: 'reports.html', icon: 'i-folder', cat: 'Navigation' },
      { text: 'Go to DGCEO Decision Hub', url: 'dgceo-hub.html', icon: 'i-shield', cat: 'Navigation' },
      { text: 'Go to DGCEO Correspondence Tracker', url: 'dgceo-tracker.html', icon: 'i-folder', cat: 'Navigation' },
      { text: 'Go to Executive Ops Hub', url: 'exec-hub.html', icon: 'i-building', cat: 'Navigation' },
      { text: 'Go to Fast-Track Correlation', url: 'fast-track.html', icon: 'i-sparkle', cat: 'Navigation' },
      { text: 'Change Endpoint Station', url: 'settings.html', icon: 'i-settings', cat: 'Navigation' },
      { text: 'Switch: Theme Mode Cycle', action: 'toggleTheme', icon: 'i-sparkle', cat: 'System Action', shortcut: 'T' },
      { text: 'Switch: Density Mode Toggle', action: 'toggleDensity', icon: 'i-grid', cat: 'System Action', shortcut: 'D' }
    ];

    const input = document.getElementById('cmdk-search-input');
    const results = document.getElementById('cmdk-results-list');
    let selectedIndex = 0;
    let activeList = [];

    function renderList(filterText = '') {
      const q = filterText.toLowerCase();
      const filtered = items.filter(it => it.text.toLowerCase().includes(q) || it.cat.toLowerCase().includes(q));
      activeList = filtered;
      selectedIndex = Math.min(selectedIndex, activeList.length - 1);
      selectedIndex = Math.max(selectedIndex, 0);

      if (filtered.length === 0) {
        results.innerHTML = `<div style="padding: var(--dgo-s-4); color: var(--dgo-color-fg-subtle); text-align: center; font-size:var(--dgo-type-body-sm);">No results matching search keys.</div>`;
        return;
      }

      // Group by category
      const groups = {};
      filtered.forEach((it, idx) => {
        if (!groups[it.cat]) groups[it.cat] = [];
        groups[it.cat].push({ ...it, originalIdx: idx });
      });

      let html = '';
      Object.keys(groups).forEach(cat => {
        html += `
          <div class="dgo-cmdk__group">
            <div class="dgo-cmdk__group-title">${cat}</div>
        `;
        groups[cat].forEach(item => {
          const isSel = item.originalIdx === selectedIndex;
          html += `
            <div class="dgo-cmdk__item ${isSel ? 'dgo-cmdk__item--selected' : ''}" data-index="${item.originalIdx}">
              <div class="dgo-cmdk__item-meta">
                <svg><use href="assets/icons/sprite.svg#${item.icon}"></use></svg>
                <span class="dgo-cmdk__item-text">${item.text}</span>
              </div>
              ${item.shortcut ? `<span class="dgo-cmdk__item-shortcut">${item.shortcut}</span>` : ''}
            </div>
          `;
        });
        html += `</div>`;
      });

      results.innerHTML = html;

      // Event listeners per item click
      const elItems = results.querySelectorAll('.dgo-cmdk__item');
      elItems.forEach(el => {
        el.addEventListener('click', () => {
          executeCommand(activeList[parseInt(el.getAttribute('data-index'))]);
        });
      });
    }

    function executeCommand(opt) {
      if (!opt) return;
      
      toggleCommandPalette(false);
      
      if (opt.url) {
        window.location.href = opt.url;
      } else if (opt.action) {
        if (opt.action === 'toggleTheme') {
          const s = window.State.getVisualSettings();
          const nextTheme = s.theme === 'light' ? 'dark' : (s.theme === 'dark' ? 'hc' : 'light');
          window.State.applyVisualSettings({ theme: nextTheme });
          showToast(`Theme changed to ${nextTheme.toUpperCase()}`, 'success');
        } else if (opt.action === 'toggleDensity') {
          const s = window.State.getVisualSettings();
          const nextDensity = s.density === 'comfortable' ? 'compact' : 'comfortable';
          window.State.applyVisualSettings({ density: nextDensity });
          showToast(`Layout changed to ${nextDensity.toUpperCase()}`, 'success');
        }
      }
    }

    // Input listening
    input.addEventListener('input', (e) => {
      renderList(e.target.value);
    });

    // Keyboard bindings inside modal
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % activeList.length;
        renderList(input.value);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + activeList.length) % activeList.length;
        renderList(input.value);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeList[selectedIndex]) executeCommand(activeList[selectedIndex]);
      } else if (e.key === 'Escape') {
        toggleCommandPalette(false);
      }
    });

    // Hotkey hooks Ctrl+K
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette(true);
      }
    });

    // Overlay click dismiss
    parent.addEventListener('click', (e) => {
      if (e.target === parent) {
        toggleCommandPalette(false);
      }
    });

    function toggleCommandPalette(show) {
      if (show) {
        parent.classList.add('dgo-modal-overlay--active');
        input.value = '';
        renderList('');
        setTimeout(() => input.focus(), 80);
      } else {
        parent.classList.remove('dgo-modal-overlay--active');
      }
    }

    // Export toggle method
    Chrome.showCommandPalette = () => toggleCommandPalette(true);
  }

  // Global data refresh (IN-PLACE — no page reload). Re-runs the single Fetch-All
  // (superset) and notifies every module to re-render from the refreshed cache via the
  // `dgo:data-refreshed` event. Cached primary data is preserved until fresh data
  // overwrites it, so nothing is lost and scroll/form state is kept.
  let _refreshing = false;
  async function refreshData() {
    if (_refreshing) return;
    _refreshing = true;
    const btn = document.getElementById('btn-global-refresh');
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    showToast('Refreshing data…', 'info');
    try {
      if (window.API && window.API.fetchAll) await window.API.fetchAll();
      window.dispatchEvent(new CustomEvent('dgo:data-refreshed'));
      showToast('Data refreshed.', 'success');
    } catch (e) {
      showToast('Refresh failed — showing last loaded data.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
      _refreshing = false;
    }
  }

  return {
    bootstrap,
    showToast,
    refreshData
  };
})();

window.Chrome = Chrome;
// Helper globally mapped toaster
function showToast(message, type = 'success') {
  window.Chrome.showToast(message, type);
}
