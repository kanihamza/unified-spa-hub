/* ============================================================
   DGO v2.2 — Secure Decision Hub Execution Engine
   Direct integration with window.Lookups. Bypasses redundant E01 queries.
   ============================================================ */

(() => {
  "use strict";

  const STATE = {
    matrix: [],
    activeItem: null
  };

  async function syncHubData() {
    if (window.Chrome) window.Chrome.showToast("Synchronizing Decision Hub...", "info");
    
    try {
      const docRes = await window.API.callPA('E02');
      const taskRes = await window.API.callPA('E04');

      const rawDocs = docRes.records || [];
      const rawTasks = taskRes.records || [];

      STATE.matrix = rawTasks.map(task => {
        const doc = rawDocs.find(d => d.id === task.documentId);
        return {
          ...task,
          parentDoc: doc,
          derivedStatus: task.status || 'Pending'
        };
      });

      renderFeedList();
      populateLookups();
    } catch (e) {
      console.error("Hub synchronization failed", e);
      if (window.Chrome) window.Chrome.showToast("Failed to align decision registries.", "error");
    }
  }

  function populateLookups() {
    const select = document.getElementById('delegateOfficer');
    if (!select) return;

    select.innerHTML = '<option value="">Route &amp; Delegate To...</option>';
    
    // Read from centralized reference lookups
    const depts = window.Lookups.getDepartments();
    const officers = window.Lookups.getOfficers();

    depts.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.code;
      opt.textContent = `[DEPT] ${d.name}`;
      select.appendChild(opt);
    });

    officers.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `[OFFICER] ${o.name} (${o.role})`;
      select.appendChild(opt);
    });
  }

  function renderFeedList() {
    const list = document.getElementById('feedList');
    if (!list) return;
    list.innerHTML = '';

    if (STATE.matrix.length === 0) {
      list.innerHTML = '<div class="aid-empty">No pending decisions in queue.</div>';
      return;
    }

    STATE.matrix.forEach(item => {
      const card = document.createElement('div');
      card.className = `feed-item priority-${item.priority} ${STATE.activeItem?.id === item.id ? 'active' : ''}`;
      card.addEventListener('click', () => selectItem(item));

      card.innerHTML = `
        <div class="item-meta">
          <span>${Sanitizer.escape(item.id)}</span>
          <span class="status-badge status-${item.derivedStatus.toLowerCase()}">${Sanitizer.escape(item.derivedStatus)}</span>
        </div>
        <div class="item-title">${Sanitizer.escape(item.title)}</div>
      `;
      list.appendChild(card);
    });
  }

  function selectItem(item) {
    STATE.activeItem = item;
    renderFeedList();

    const container = document.getElementById('detailContent');
    const bar = document.getElementById('actionBar');
    
    if (!container) return;

    bar.style.display = 'flex';
    container.innerHTML = `
      <h2 class="detail-title">${Sanitizer.escape(item.title)}</h2>
      <div class="detail-meta mb-4">
        <span class="meta-tag">Priority: ${Sanitizer.escape(item.priority)}</span>
        <span class="meta-tag">Status: ${Sanitizer.escape(item.derivedStatus)}</span>
      </div>
      <div class="dgo-card dgo-stack dgo-stack--2" style="background:white; padding:15px; border-radius:8px;">
        <span class="dgo-overline">Task Directive Scope</span>
        <p class="dgo-body-sm">${Sanitizer.escape(item.directives || 'No direct instructions issued.')}</p>
      </div>
    `;
  }

  window.submitDecision = async (type) => {
    if (!STATE.activeItem) return;
    const notes = document.getElementById('decisionNotes').value;
    const delegate = document.getElementById('delegateOfficer').value;

    if (type === 'Delegate' && !delegate) {
      if (window.Chrome) window.Chrome.showToast("Please specify delegation target.", "warning");
      return;
    }

    if (window.Chrome) window.Chrome.showToast("Submitting executive decision...", "info");

    try {
      const res = await window.API.callPA('E05', {
        taskId: STATE.activeItem.id,
        status: type === 'Approve' ? 'COMPLETED' : 'ROUTED',
        progress: type === 'Approve' ? 100 : 50,
        notes: notes || `Executive decision registered: ${type}.`
      });

      if (res.success) {
        if (window.Chrome) window.Chrome.showToast("Decision registered and synchronized.", "success");
        syncHubData();
        document.getElementById('decisionNotes').value = '';
        document.getElementById('delegateOfficer').value = '';
        STATE.activeItem = null;
        selectItem(null);
      }
    } catch (e) {
      console.error("Decision post failed", e);
      if (window.Chrome) window.Chrome.showToast("Gateway rejected decision posting.", "error");
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (window.Chrome) window.Chrome.bootstrap('dgceo-hub');
    syncHubData();
    window.addEventListener('dgo:data-refreshed', syncHubData); // in-place re-render
  });
})();
