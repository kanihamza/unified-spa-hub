/* ============================================================
   DGO v2.2 — Harmonized GTQ Reports State and Execution Engine
   Now strictly integrated with window.State session context.
   ============================================================ */

(() => {
  "use strict";

  const STATE = {
    selectedTag: 'All',
    collections: {
      colTaskReport: [],
      colDGOReport: []
    }
  };

  const $ = (id) => document.getElementById(id);

  function syncStatusLabel() {
    const user = window.State.getActiveUser();
    const lbl = $('statusLabelText');
    if (lbl && user) {
      lbl.innerHTML = `<span class="dgo-badge dgo-badge--routed">Acting as: ${Sanitizer.escape(user.name)} (${user.roleCode})</span>`;
    }
  }

  async function fetchReportData() {
    if (window.Chrome) window.Chrome.showToast("Retrieving secure OData reports...", "info");
    
    try {
      const taskRes = await window.API.callPA('E04');
      const docRes = await window.API.callPA('E02');

      STATE.collections.colTaskReport = taskRes.records || [];
      STATE.collections.colDGOReport = docRes.records || [];

      document.getElementById('recordCountBadge').textContent = 
        STATE.collections.colTaskReport.length + STATE.collections.colDGOReport.length;

      renderActiveTemplate();
    } catch (e) {
      console.error("Failed to fetch reports", e);
      if (window.Chrome) window.Chrome.showToast("Failed to compile cloud report nodes.", "error");
    }
  }

  function renderActiveTemplate() {
    const stage = $('reportStage');
    const records = [...STATE.collections.colTaskReport, ...STATE.collections.colDGOReport];
    
    if (records.length === 0) {
      stage.innerHTML = '<div class="report-empty">No active records for dates scope.</div>';
      return;
    }

    const tbody = records.map(r => {
      return `
        <tr>
          <td style="padding: var(--dgo-s-3); border-bottom:1px solid var(--dgo-color-border-default); font-family:var(--dgo-family-mono);">${Sanitizer.escape(r.id)}</td>
          <td style="padding: var(--dgo-s-3); border-bottom:1px solid var(--dgo-color-border-default);">${Sanitizer.escape(r.title || r.subject)}</td>
          <td style="padding: var(--dgo-s-3); border-bottom:1px solid var(--dgo-color-border-default);"><span class="dgo-badge dgo-badge--pending">${Sanitizer.escape(r.status)}</span></td>
        </tr>
      `;
    }).join('');

    stage.innerHTML = `
      <div class="dgo-card dgo-stack dgo-stack--3">
        <h3 class="dgo-h3" style="color:var(--dgo-color-action-primary);">Compliance Summary Report</h3>
        <div class="dgo-table-container">
          <table class="dgo-table">
            <thead>
              <tr><th>Reference ID</th><th>Subject / Directive</th><th>Workflow Status</th></tr>
            </thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Bootstrap visual shell
    if (window.Chrome) window.Chrome.bootstrap('reports');
    
    syncStatusLabel();
    fetchReportData();

    const printBtn = document.getElementById('btnPrint');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
  });
})();
