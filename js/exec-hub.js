/* ============================================================
   DGO v2.2 — Exec Hub Synchronization & Alignment Engine
   Replaced all local toast duplicates with global Chrome alerts.
   ============================================================ */

(() => {
  "use strict";

  const STATE = {
    tasks: [],
    activeNode: null
  };

  async function syncNodeRegistry() {
    try {
      const res = await window.API.callPA('E04');
      STATE.tasks = res.records || [];
      renderNodeList();
    } catch (e) {
      console.error("Exec Hub Sync Failed", e);
      if (window.Chrome) window.Chrome.showToast("Failed to align Node Registries.", "error");
    }
  }

  function renderNodeList() {
    const list = document.getElementById('taskList');
    if (!list) return;
    list.innerHTML = '';

    if (STATE.tasks.length === 0) {
      list.innerHTML = '<div class="aid-empty">No active execution nodes.</div>';
      return;
    }

    STATE.tasks.forEach(task => {
      const div = document.createElement('div');
      div.className = `task-card ${STATE.activeNode?.id === task.id ? 'active' : ''}`;
      div.addEventListener('click', () => selectNode(task));
      
      div.innerHTML = `
        <div class="task-id">
          <span>${Sanitizer.escape(task.id)}</span>
          <span>${Sanitizer.escape(task.priority)}</span>
        </div>
        <div class="task-title">${Sanitizer.escape(task.title)}</div>
      `;
      list.appendChild(div);
    });
  }

  function selectNode(task) {
    STATE.activeNode = task;
    renderNodeList();

    const activeView = document.getElementById('viewActive');
    const emptyView = document.getElementById('viewEmpty');

    if (!activeView) return;

    emptyView.style.display = 'none';
    activeView.classList.add('show');

    document.getElementById('dtTitle').textContent = task.title;
    document.getElementById('dtRef').textContent = task.id;
    document.getElementById('dtStatus').textContent = task.status;
    document.getElementById('dtPriority').textContent = task.priority;
    document.getElementById('dtAssignee').textContent = task.assignee || 'Unassigned';
    document.getElementById('dtDesc').textContent = task.directives || 'No baseline directive payload.';
  }

  window.submitAction = async (type) => {
    if (!STATE.activeNode) return;
    const notes = document.getElementById('actionNotes').value;

    if (window.Chrome) window.Chrome.showToast("Dispatching target transaction...", "info");

    try {
      const res = await window.API.callPA('E05', {
        taskId: STATE.activeNode.id,
        status: type === 'Approve' ? 'COMPLETED' : 'ROUTED',
        progress: type === 'Approve' ? 100 : 60,
        notes: notes || `Direct clearance: ${type}.`
      });

      if (res.success) {
        if (window.Chrome) window.Chrome.showToast("Cleared and synchronized.", "success");
        syncNodeRegistry();
        STATE.activeNode = null;
        document.getElementById('viewActive').classList.remove('show');
        document.getElementById('viewEmpty').style.display = 'flex';
      }
    } catch (e) {
      console.error(e);
      if (window.Chrome) window.Chrome.showToast("Routing gateway exception caught.", "error");
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (window.Chrome) window.Chrome.bootstrap('exec-hub');
    syncNodeRegistry();
  });
})();
