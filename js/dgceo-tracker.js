(function(){
  "use strict";

  let applicationState = {
      records: [],
      filters: { status: 'All', category: 'All', search: '' }
  };

  function safeText(str) { return str == null ? '' : String(str); }

  async function uploadToPowerAutomate(action, data) {
      try {
          const payload = { action, module: 'DGCEO_Tracker', data };
          if(window.API && window.API.callPA) {
              const res = await window.API.callPA('E02', payload); 
              return { success: res.success || res.ok !== false, simulated: false };
          }
          return { success: true, simulated: true };
      } catch (error) {
          showToast("Network warning: Update saved locally but Flow sync failed.", "error");
          return { success: false, error: error.message };
      }
  }

  function seedInitialData() {
      applicationState.records = [
          {
              id: 'NITDA-892101',
              category: 'Ministerial Directive',
              priority: 'High',
              sender: 'Ministry of Communications',
              contact: 'hmo@fmcide.gov.ng',
              receivedDate: '2026-04-28',
              eventDate: '',
              subject: 'Review of National AI Strategy Framework',
              remarks: 'Implementation stages requested within 48 hours.',
              status: 'Pending'
          }
      ];
  }

  function updateDashboard() {
      const records = applicationState.records;
      
      document.getElementById('stat-total').innerText = records.length;
      document.getElementById('stat-pending').innerText = records.filter(r => r.status === 'Pending').length;
      document.getElementById('stat-accepted').innerText = records.filter(r => r.status === 'Accepted').length;
      document.getElementById('stat-high').innerText = records.filter(r => r.priority === 'High').length;

      const tbody = document.getElementById('dashboard-recent-tbody');
      if(!tbody) return;
      tbody.innerHTML = '';
      
      records.slice(0, 5).forEach(record => {
          const tr = document.createElement('tr');
          tr.className = "hover:bg-slate-50 transition-colors";
          tr.innerHTML = `
              <td class="p-4">
                  <div class="font-bold text-slate-800">${escapeHtml(record.subject)}</div>
                  <div class="text-xs text-slate-500 font-medium">${escapeHtml(record.sender)}</div>
              </td>
              <td class="p-4 font-medium text-slate-600">${formatDate(record.receivedDate)}</td>
              <td class="p-4">${getStatusBadge(record.status)}</td>
              <td class="p-4 text-right">
                  <button onclick="editRecord('${record.id}')" class="text-primary hover:bg-green-50 p-2.5 rounded-lg transition-colors shadow-sm border border-transparent hover:border-green-200"><i class="fa-solid fa-pen-to-square">🖊</i></button>
              </td>
          `;
          tbody.appendChild(tr);
      });
  }

  function renderRecordsTable() {
      const tbody = document.getElementById('records-tbody');
      const emptyState = document.getElementById('records-empty-state');
      if(!tbody) return;
      tbody.innerHTML = '';
      
      let filtered = applicationState.records;

      if(applicationState.filters.status !== 'All') {
          filtered = filtered.filter(r => r.status === applicationState.filters.status);
      }
      if(applicationState.filters.category !== 'All') {
          filtered = filtered.filter(r => r.category === applicationState.filters.category);
      }
      if(applicationState.filters.search) {
          const s = applicationState.filters.search;
          filtered = filtered.filter(r => 
              r.subject.toLowerCase().includes(s) || 
              r.sender.toLowerCase().includes(s) ||
              r.id.toLowerCase().includes(s)
          );
      }

      if(filtered.length === 0) {
          tbody.parentNode.classList.add('hidden');
          if(emptyState) emptyState.classList.remove('hidden');
      } else {
          tbody.parentNode.classList.remove('hidden');
          if(emptyState) emptyState.classList.add('hidden');
          
          filtered.forEach(record => {
              const tr = document.createElement('tr');
              tr.className = "hover:bg-slate-50 transition-colors";
              tr.innerHTML = `
                  <td class="p-4 font-mono text-xs font-bold text-primary">${escapeHtml(record.id)}</td>
                  <td class="p-4">
                      <div class="font-bold text-slate-800">${escapeHtml(record.subject)}</div>
                      <div class="text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-600 inline-block px-2 py-0.5 rounded mt-1.5">${escapeHtml(record.category)}</div>
                  </td>
                  <td class="p-4 text-slate-700 font-medium">${escapeHtml(record.sender)}</td>
                  <td class="p-4">
                      <div class="text-sm font-medium text-slate-600">Rcvd: ${formatDate(record.receivedDate)}</div>
                      ${record.eventDate ? `<div class="text-xs text-secondary font-bold mt-1.5"><i class="fa-solid fa-calendar mr-1"></i> ${formatDate(record.eventDate)}</div>` : ''}
                  </td>
                  <td class="p-4">${getPriorityBadge(record.priority)}</td>
                  <td class="p-4">${getStatusBadge(record.status)}</td>
                  <td class="p-4 text-right space-x-1">
                      <button onclick="editRecord('${record.id}')" class="text-slate-500 hover:text-primary hover:bg-slate-100 p-2 rounded transition-colors" title="Edit">
                          <i class="fa-solid fa-pen">🖊</i>
                      </button>
                      <button onclick="quickAction('${record.id}', 'Accepted')" class="text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 p-2 rounded transition-colors" title="Mark Accepted">
                          <i class="fa-solid fa-check-double">✓</i>
                      </button>
                      <button onclick="deleteRecord('${record.id}')" class="text-slate-500 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors" title="Archive/Delete">
                          <i class="fa-solid fa-trash">🗑</i>
                      </button>
                  </td>
              `;
              tbody.appendChild(tr);
          });
      }

      document.getElementById('page-end').innerText = filtered.length;
      document.getElementById('page-total').innerText = filtered.length;
      document.getElementById('page-start').innerText = filtered.length > 0 ? '1' : '0';
  }

  window.applyFilters = function() {
      applicationState.filters.status = document.getElementById('filter-status').value;
      applicationState.filters.category = document.getElementById('filter-category').value;
      renderRecordsTable();
  }

  window.filterRecords = function(type, value) {
      document.getElementById(`filter-${type}`).value = value;
      applyFilters();
  }

  function updateBadges() {
      const pBadge = document.getElementById('badge-pending');
      if (pBadge) pBadge.innerText = applicationState.records.filter(r => r.status === 'Pending').length;
      const eBadge = document.getElementById('badge-events');
      if (eBadge) eBadge.innerText = applicationState.records.filter(r => r.category === 'Event Invitation').length;
  }

  window.editRecord = function(id) {
      const record = applicationState.records.find(r => r.id === id);
      if(!record) return;

      document.getElementById('entry-id').value = record.id;
      document.getElementById('form-category').value = record.category;
      document.getElementById('form-priority').value = record.priority;
      document.getElementById('form-sender').value = record.sender;
      document.getElementById('form-contact').value = record.contact || '';
      document.getElementById('form-received-date').value = record.receivedDate;
      
      if(record.eventDate) {
          document.getElementById('form-event-date').value = record.eventDate;
      } else {
          document.getElementById('form-event-date').value = '';
      }

      document.getElementById('form-subject').value = record.subject;
      document.getElementById('form-remarks').value = record.remarks;
      document.getElementById('form-status').value = record.status;

      switchTab('new-entry');
      document.getElementById('page-title').innerText = `Edit Official Record: ${record.id}`;
  }

  window.quickAction = async function(id, newStatus) {
      const index = applicationState.records.findIndex(r => r.id === id);
      if(index !== -1) {
          applicationState.records[index].status = newStatus;
          await uploadToPowerAutomate('update_status', { id, status: newStatus });
          updateUI();
          showToast(`Status successfully updated to ${newStatus}`, 'success');
      }
  }

  window.deleteRecord = async function(id) {
      if(confirm('Confirm deletion of this official record? This action will sync to the database.')) {
          applicationState.records = applicationState.records. filter(r => r.id !== id);
          await uploadToPowerAutomate('delete_record', { id });
          updateUI();
          showToast('Record deleted and removed from system.', 'info');
      }
  }

  window.resetForm = function() {
      const form = document.getElementById('entry-form');
      if(form) form.reset();
      document.getElementById('entry-id').value = '';
      document.getElementById('form-received-date').valueAsDate = new Date();
      const ve = document.getElementById('view-new-entry');
      if(ve && ve.classList.contains('active')) {
          document.getElementById('page-title').innerText = 'Log New Correspondence';
      }
  }

  window.triggerManualSync = async function() {
      showToast("Initiating secure Flow synchronization...", "info");
      const result = await uploadToPowerAutomate('full_sync', applicationState.records);
      setTimeout(() => {
          if(result.success) showToast("Database synchronization complete.", "success");
      }, 1000);
  }

  window.exportToCSV = function() {
      if(applicationState.records.length === 0) {
          showToast("No data available to export.", "info");
          return;
      }
      
      const headers = "Reference_ID,Category,Priority,Status,Sender_MDA,Subject,ReceivedDate,EventDate\n";
      const rows = applicationState.records.map(r => 
          `"${r.id}","${r.category}","${r.priority}","${r.status}","${r.sender.replace(/"/g, '""')}","${r.subject.replace(/"/g, '""')}","${r.receivedDate}","${r.eventDate || ''}"`
      ).join("\n");
      
      const blob = new Blob([headers + rows], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', `NITDA_DG_Records_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  }

  function getStatusBadge(status) {
      return `<span style="font-size:10px;font-weight:bold;padding:2px 8px;border-radius:12px;background:#f1f5f9;color:#475569;">${escapeHtml(status)}</span>`;
  }

  function getPriorityBadge(priority) {
      return `<span style="font-size:10px;font-weight:bold;padding:2px 8px;border-radius:12px;background:#fff8ec;color:#ca8a04;">${escapeHtml(priority)}</span>`;
  }

  function formatDate(dateStr) {
      if(!dateStr) return '';
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function showToast(message, type = 'info') {
      if (window.Chrome && window.Chrome.showToast) {
         window.Chrome.showToast(message, type);
      } else {
         alert(message);
      }
  }

  function escapeHtml(str) {
      return safeText(str).replace(/[&<>'"]/g, tag => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[tag]));
  }

  window.switchTab = function(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      const tgt = document.getElementById(`view-${tabId}`);
      if(tgt) tgt.classList.add('active');
      
      document.querySelectorAll('.nav-btn').forEach(btn => {
          btn.classList.remove('bg-primary', 'text-white', 'border', 'border-green-700', 'shadow-md');
          btn.classList.add('text-green-100');
      });
      const activeBtn = document.getElementById(`nav-${tabId}`);
      if(activeBtn) {
        activeBtn.classList.remove('text-green-100');
        activeBtn.classList.add('bg-primary', 'text-white', 'border', 'border-green-700', 'shadow-md');
      }

      const titles = {
          'dashboard': 'Dashboard Overview',
          'new-entry': 'Log New Correspondence',
          'records': 'All Records & Archives'
      };
      const titleObj = document.getElementById('page-title');
      if (titleObj) titleObj.innerText = titles[tabId] || '';

      if(tabId === 'records') renderRecordsTable();
      if(tabId === 'dashboard') updateDashboard();
  }

  async function handleFormSubmit(e) {
      e.preventDefault();
      const entryId = document.getElementById('entry-id').value;
      const isEdit = !!entryId;
      
      const payload = {
          id: isEdit ? entryId : `NITDA-${Date.now().toString().slice(-6)}`,
          category: document.getElementById('form-category').value,
          priority: document.getElementById('form-priority').value,
          sender: document.getElementById('form-sender').value,
          contact: document.getElementById('form-contact').value,
          receivedDate: document.getElementById('form-received-date').value,
          eventDate: document.getElementById('form-event-date').value,
          subject: document.getElementById('form-subject').value,
          remarks: document.getElementById('form-remarks').value,
          status: document.getElementById('form-status').value,
          timestamp: new Date().toISOString()
      };

      if (isEdit) {
          const index = applicationState.records.findIndex(r => r.id === entryId);
          if(index !== -1) applicationState.records[index] = payload;
      } else {
          applicationState.records.unshift(payload);
      }

      await uploadToPowerAutomate('upsert_record', payload);
      showToast(`Record ${isEdit ? 'updated' : 'saved'} successfully!`, 'success');
      resetForm();
      updateUI();
      switchTab('records');
  }

  function updateUI() {
      updateDashboard();
      updateBadges();
      const vr = document.getElementById('view-records');
      if(vr && vr.classList.contains('active')) {
          renderRecordsTable();
      }
  }

  function setupEventListeners() {
      const form = document.getElementById('entry-form');
      if(form) form.addEventListener('submit', handleFormSubmit);
      const search = document.getElementById('global-search');
      if (search) {
        search.addEventListener('input', (e) => {
            applicationState.filters.search = e.target.value.toLowerCase();
            const vr = document.getElementById('view-records');
            if(vr && vr.classList.contains('active')) {
                renderRecordsTable();
            } else {
                switchTab('records');
            }
        });
      }
  }

  function init() {
    if (window.Chrome) window.Chrome.bootstrap('dgceo-tracker');
    const rd = document.getElementById('form-received-date');
    if (rd) rd.valueAsDate = new Date();
    seedInitialData();
    updateUI();
    setupEventListeners();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
