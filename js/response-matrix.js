/* ============================================================
   DGO v2.2 — Upgraded Safe Response Matrix Trace Engine
   ============================================================ */

(() => {
  "use strict";

  function renderMatrixTable(records) {
    const tbody = document.getElementById('matrixTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!records || records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="p-5 text-center text-gray-400">No matching trace nodes found.</td></tr>';
      return;
    }

    records.forEach(item => {
      const parentDocText = item.parentDoc ? `<span class="badge bg-teal-100 text-teal-800">Linked Doc</span>` : '';
      
      const tr = Sanitizer.createRow([
        { content: item.id || 'N/A', className: 'p-5 font-mono text-xs font-bold text-teal-800' },
        { content: `<div><div class="font-bold text-gray-800">${Sanitizer.escape(item.Title || item.title)}</div><div class="flex gap-2 mt-2">${parentDocText}</div></div>`, isHTML: true, className: 'p-5' },
        { content: item.Assignee || item.assignee || 'Unassigned', className: 'p-5 text-xs text-gray-700 font-bold' },
        { content: `${item.slaPercent || 0}%`, className: 'p-5' },
        { content: `<span class="status-badge">${item.derivedStatus || 'Pending'}</span>`, isHTML: true, className: 'p-5 text-center' },
        { content: `<button class="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold" data-act="openMatrixModal" data-arg="${window.Sanitizer.escape(item.id)}">Trace</button>`, isHTML: true, className: 'p-5 text-right' }
      ]);

      tbody.appendChild(tr);
    });
  }

  window.renderMatrixTable = renderMatrixTable;
})();
