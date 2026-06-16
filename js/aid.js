/* ============================================================
   DGO v2.2 — Upgraded Safe AID Dashboard View Engine
   ============================================================ */

(() => {
  "use strict";

  const STATE = {
    rows: [],
    filter: 'all',
    syncing: false
  };

  async function syncRegistry(force = false) {
    if (STATE.syncing) return;
    STATE.syncing = true;

    const tbody = document.getElementById('aid-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="aid-empty">Synchronizing Registry...</td></tr>';

    try {
      const taskRes = await window.API.callPA('E04', {}, { force });
      const docRes = await window.API.callPA('E02', {}, { force });
      
      const combined = [...(taskRes.records || []), ...(docRes.records || [])];
      STATE.rows = combined;
      renderTable();
    } catch (e) {
      console.error("AID sync failed", e);
      tbody.innerHTML = '<tr><td colspan="6" class="aid-empty text-danger">Failed to sync registry data.</td></tr>';
    } finally {
      STATE.syncing = false;
    }
  }

  function renderTable() {
    const tbody = document.getElementById('aid-tbody');
    tbody.innerHTML = '';

    if (STATE.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="aid-empty">Registry is empty.</td></tr>';
      return;
    }

    STATE.rows.forEach(row => {
      const tr = Sanitizer.createRow([
        { content: row.id, className: 'aid-ref-id' },
        { content: row.title || row.subject || 'N/A', className: 'aid-subj' },
        { content: `<span class="aid-status">${Sanitizer.escape(row.status)}</span>`, isHTML: true },
        { content: row.assignee || 'Unassigned', className: 'aid-officer' },
        { content: row.dueDate || 'No Due Date', className: 'aid-due' },
        { content: row.category || 'General', className: 'aid-dsu' }
      ]);
      tbody.appendChild(tr);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.Chrome) window.Chrome.bootstrap('aid');
    const syncBtn = document.getElementById('btn-sync');
    if (syncBtn) syncBtn.addEventListener('click', () => syncRegistry(true)); // manual refresh = force
    syncRegistry(false); // initial = cached (no refetch on navigation)
  });
})();
