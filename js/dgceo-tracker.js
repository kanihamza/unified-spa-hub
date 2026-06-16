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
              // E14 = Dynamic Multi-Actions (catch-all WRITE flow). Routes through the
              // central Outbox (queue + retry); replaces the prior incorrect E02 (read) call.
              const res = await window.API.callPA('E14', payload);
              return { success: res.success || res.ok !== false, simulated: false };
          }
          return { success: true, simulated: true };
      } catch (error) {
          showToast("Network warning: Update saved locally but Flow sync failed.", "error");
          return { success: false, error: error.message };
      }
  }

  // Load correspondence records live from the dossier/correspondence flow (E02).
  async function loadRecords() {
      try {
          if (!(window.API && window.API.callPA)) { applicationState.records = []; return; }
          const res = await window.API.callPA('E02', { action: 'getDocs', operation: 'read', source: 'DGCEO_Tracker' });
          const docs = (res && (res.records || res.docs)) || [];
          applicationState.records = docs.map(d => ({
              id: safeText(d.id != null ? d.id : d.ID),
              category: safeText(d.category || d.Category || 'Other'),
              priority: safeText(d.priority || d.Priority || 'Normal'),
              sender: safeText(d.sender || d.Sender || ''),
              contact: safeText(d.contact || d.EditorEmail || ''),
              receivedDate: String(d.receivedDate || d.Created || d.received || '').slice(0, 10),
              eventDate: String(d.eventDate || '').slice(0, 10),
              subject: safeText(d.subject || d.title || d.Title || ''),
              remarks: safeText(d.remarks || d.directives || d.Description || ''),
              status: safeText(d.status || d.Status || d.AssignmentStatus || 'Pending')
          }));
      } catch (e) {
          applicationState.records = [];
          showToast('Unable to load correspondence from the live flow.', 'error');
      }
  }

  function updateDashboard() {
      const records = applicationState.records;
      
      document.getElementById('stat-total').textContent = records.length;
      document.getElementById('stat-pending').textContent = records.filter(r => r.status === 'Pending').length;
      document.getElementById('stat-accepted').textContent = records.filter(r => r.status === 'Accepted').length;
      document.getElementById('stat-high').textContent = records.filter(r => r.priority === 'High').length;

      const tbody = document.getElementById('dashboard-recent-tbody');
      if(!tbody) return;
      tbody.innerHTML = '';

      if (records.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--dgo-color-fg-subtle);">No registrations yet.</td></tr>';
          return;
      }

      records.slice(0, 5).forEach(record => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
              <td>
                  <div style="font-weight:600;">${escapeHtml(record.subject)}</div>
                  <div style="font-size:10px; color: var(--dgo-color-fg-muted);">${escapeHtml(record.sender)}</div>
              </td>
              <td style="color: var(--dgo-color-fg-muted);">${formatDate(record.receivedDate)}</td>
              <td>${getStatusBadge(record.status)}</td>
              <td style="text-align:right;">
                  <button class="dgo-btn dgo-btn--sm dgo-btn--ghost" onclick="editRecord('${escapeHtml(record.id)}')" aria-label="Edit record">
                      <svg style="width:14px;height:14px;"><use href="assets/icons/sprite.svg#i-edit"></use></svg>
                  </button>
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
              tr.innerHTML = `
                  <td style="font-family: var(--dgo-family-mono); font-size: 11px; font-weight:700; color: var(--dgo-color-action-primary);">${escapeHtml(record.id)}</td>
                  <td>
                      <div style="font-weight:600;">${escapeHtml(record.subject)}</div>
                      <span class="dgo-badge dgo-badge--draft" style="font-size:10px; margin-top:4px;">${escapeHtml(record.category)}</span>
                  </td>
                  <td>${escapeHtml(record.sender)}</td>
                  <td>
                      <div style="font-size: var(--dgo-type-body-sm);">Rcvd: ${formatDate(record.receivedDate)}</div>
                      ${record.eventDate ? `<div style="font-size:11px; color: var(--dgo-color-action-accent); font-weight:600; margin-top:4px;">📅 ${formatDate(record.eventDate)}</div>` : ''}
                  </td>
                  <td>${getPriorityBadge(record.priority)}</td>
                  <td>${getStatusBadge(record.status)}</td>
                  <td style="text-align:right; white-space:nowrap;">
                      <button class="dgo-btn dgo-btn--sm dgo-btn--ghost" onclick="editRecord('${escapeHtml(record.id)}')" aria-label="Edit"><svg style="width:14px;height:14px;"><use href="assets/icons/sprite.svg#i-edit"></use></svg></button>
                      <button class="dgo-btn dgo-btn--sm dgo-btn--ghost" onclick="quickAction('${escapeHtml(record.id)}','Accepted')" aria-label="Mark accepted"><svg style="width:14px;height:14px;"><use href="assets/icons/sprite.svg#i-check"></use></svg></button>
                      <button class="dgo-btn dgo-btn--sm dgo-btn--ghost" onclick="deleteRecord('${escapeHtml(record.id)}')" aria-label="Delete"><svg style="width:14px;height:14px;"><use href="assets/icons/sprite.svg#i-trash"></use></svg></button>
                  </td>
              `;
              tbody.appendChild(tr);
          });
      }

      document.getElementById('page-end').textContent = filtered.length;
      document.getElementById('page-total').textContent = filtered.length;
      document.getElementById('page-start').textContent = filtered.length > 0 ? '1' : '0';
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
      if (pBadge) pBadge.textContent = applicationState.records.filter(r => r.status === 'Pending').length;
      const eBadge = document.getElementById('badge-events');
      if (eBadge) eBadge.textContent = applicationState.records.filter(r => r.category === 'Event Invitation').length;
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
      document.getElementById('page-title').textContent = `Edit Official Record: ${record.id}`;
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
          document.getElementById('page-title').textContent = 'Log New Correspondence';
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
      const s = safeText(status).toLowerCase();
      let mod = 'draft';
      if (s.includes('pending')) mod = 'pending';
      else if (s.includes('accept') || s.includes('treat') || s.includes('complete')) mod = 'routed';
      else if (s.includes('declin')) mod = 'action';
      return `<span class="dgo-badge dgo-badge--${mod}">${escapeHtml(status)}</span>`;
  }

  function getPriorityBadge(priority) {
      const p = safeText(priority).toLowerCase();
      const mod = p === 'high' ? 'action' : (p === 'low' ? 'draft' : 'routed');
      return `<span class="dgo-badge dgo-badge--${mod}">${escapeHtml(priority)}</span>`;
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
          btn.classList.remove('dgo-btn--primary');
          btn.classList.add('dgo-btn--outline');
          btn.setAttribute('aria-selected', 'false');
      });
      const activeBtn = document.getElementById(`nav-${tabId}`);
      if(activeBtn) {
        activeBtn.classList.remove('dgo-btn--outline');
        activeBtn.classList.add('dgo-btn--primary');
        activeBtn.setAttribute('aria-selected', 'true');
      }

      const titles = {
          'dashboard': 'Dashboard Overview',
          'new-entry': 'Log New Correspondence',
          'records': 'All Records & Archives'
      };
      const titleObj = document.getElementById('page-title');
      if (titleObj) titleObj.textContent = titles[tabId] || '';

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

  async function init() {
    if (window.Chrome) window.Chrome.bootstrap('dgceo-tracker');
    const rd = document.getElementById('form-received-date');
    if (rd) rd.valueAsDate = new Date();
    setupEventListeners();
    await loadRecords();
    updateUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
