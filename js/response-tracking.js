(function(){
  "use strict";

  // Flow endpoints are centralized in js/api.js (window.API). This module reads
  // via window.API.callPA('E0x', ...) — no isolated endpoint configuration here.

  const state = {
      userEmail: 'dgsregistry@nitda.gov.ng',
      rawTasks: [],
      rawDocs: [],
      rawEmails: [],
      matrix: [],
      selectedTask: null
  };

  function safeText(str) { return str == null ? '' : String(str); }
  function safeDate(str) { const d = new Date(str); return isNaN(d) ? null : d; }
  function escapeHtml(str) {
      return safeText(str).replace(/[&<>'"]/g, 
          tag => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[tag])
      );
  }
  function formatDate(dateObj) {
      if (!dateObj) return 'N/A';
      return new Date(dateObj).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function getStatusClass(status) {
      const s = safeText(status).toLowerCase().replace(/\s+/g, '');
      if (s.includes('treated') || s.includes('completed') || s.includes('acknowledged')) return 'status-completed';
      if (s.includes('overdue')) return 'status-overdue';
      return 'status-pending'; 
  }

  window.promptUserEmail = function() {
      const email = prompt("Set active user context (Email):", state.userEmail);
      if (email) {
          state.userEmail = email.trim();
          updateAvatar();
          window.syncData();
      }
  }
  
  function updateAvatar() {
      const av = document.getElementById('avatar');
      if(av) av.innerText = state.userEmail.charAt(0).toUpperCase();
  }

  async function apiCall(code, actionDef) {
      if (!(window.API && window.API.callPA)) {
          throw new Error('Central API gateway (window.API) is unavailable.');
      }
      const result = await window.API.callPA(code, {
          action: actionDef, operation: 'read', mode: 'read', source: 'DGO_Response_Tracking',
          userEmail: state.userEmail, folderPath: 'Inbox', top: 50, skip: 0
      });
      return (result && result.data) ? result.data : result;
  }

  window.syncData = async function() {
      const tbody = document.getElementById('tableBody');
      if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading">Orchestrating Live Enterprise Data...</td></tr>';
      showNotification('Syncing from Power Automate flows...', 'info');

      try {
          const [docsData, tasksData, emailsData] = await Promise.all([
              apiCall('E02', 'getDocs'),
              apiCall('E04', 'fetch_tasks'),
              apiCall('E09', 'emailsfetch')
          ]);

          state.rawDocs = (docsData.docs || docsData.records || []).map(d => ({
              id: d.ID, title: d.Title, category: d.Category, status: d.Status || d.AssignmentStatus, link: d.AttachmentLink
          }));
          
          state.rawTasks = (tasksData.tasks || tasksData.records || []).map(t => ({
              id: t.ID, 
              refID: safeText(t.Reference_ID || t.RefIDD),
              refIDD: safeText(t.RefIDD), 
              activity: safeText(t.Title),
              description: safeText(t.Description !== true ? t.Description : ''),
              assignedTo: safeText(t.AssignedTo || t.Assigned || 'Unassigned'),
              category: safeText(t.Classification || 'Unclassified'),
              dueDate: safeDate(t.DueDate),
              status: safeText(t.Progress || t.Status || 'Pending'),
              priority: safeText(t.Priority),
              routing: safeText(t.GDSUROUT)
          }));

          state.rawEmails = (emailsData.emails || emailsData.records || []).map(e => ({
              id: e.id, 
              subject: e.subject, 
              body: safeText(e.bodyPreview || (e.body && e.body.content)), 
              from: safeText(e.fromAddress || (e.from && e.from.emailAddress && e.from.emailAddress.address)),
              received: safeDate(e.receivedDateTime)
          }));

          buildPolymorphicMatrix();
          populateCategoryFilter();
          window.applyFilters();
          showNotification('Sync Completed Successfully', 'success');

      } catch (error) {
          console.error(error);
          if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-state" style="color: #d32f2f;">Failed to sync data. Check network or endpoints.</td></tr>';
          showNotification('Sync Failed', 'error');
      }
  }

  function buildPolymorphicMatrix() {
      state.matrix = state.rawTasks.map(task => {
          const refKey = String(task.refIDD);
          const parentDoc = state.rawDocs.find(d => String(d.id) === refKey);
          let relatedEmails = [];
          if (parentDoc) {
              relatedEmails = state.rawEmails.filter(e => 
                  (e.subject && e.subject.includes(String(parentDoc.id))) || 
                  (e.body && e.body.includes(parentDoc.title))
              );
          } else {
              relatedEmails = state.rawEmails.filter(e => 
                  (e.subject && e.subject.includes(refKey)) || 
                  (e.subject && e.subject.includes(task.activity))
              );
          }

          const isOverdue = task.status !== 'Treated' && task.status !== 'Completed' && task.dueDate && task.dueDate < new Date();
          const displayStatus = isOverdue ? 'Overdue' : task.status;

          return {
              ...task, displayStatus, parentDoc: parentDoc || null, relatedEmails
          };
      });
      state.matrix.sort((a,b) => (b.dueDate || 0) - (a.dueDate || 0));
  }

  function populateCategoryFilter() {
      const select = document.getElementById('filterCategory');
      if(!select) return;
      const categories = [...new Set(state.matrix.map(m => m.category).filter(Boolean))].sort();
      select.innerHTML = '<option value="">All Categories</option>' + 
          categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }

  window.applyFilters = function() {
      const s = document.getElementById('filterAckStatus');
      const c = document.getElementById('filterCategory');
      const q = document.getElementById('filterSearch');
      
      const statusFilter = s ? s.value.toLowerCase() : '';
      const categoryFilter = c ? c.value : '';
      const searchStr = q ? q.value.toLowerCase() : '';

      let filtered = state.matrix;

      if (statusFilter) {
          if (statusFilter === 'completed') filtered = filtered.filter(r => r.displayStatus.toLowerCase().includes('treated') || r.displayStatus.toLowerCase().includes('completed'));
          else if (statusFilter === 'pending') filtered = filtered.filter(r => !r.displayStatus.toLowerCase().includes('treated') && !r.displayStatus.toLowerCase().includes('completed') && r.displayStatus.toLowerCase() !== 'overdue');
          else filtered = filtered.filter(r => r.displayStatus.toLowerCase().includes(statusFilter));
      }

      if (categoryFilter) {
          filtered = filtered.filter(r => r.category === categoryFilter);
      }

      if (searchStr) {
          filtered = filtered.filter(r =>
              r.refID.toLowerCase().includes(searchStr) ||
              r.activity.toLowerCase().includes(searchStr) ||
              r.assignedTo.toLowerCase().includes(searchStr)
          );
      }

      renderTable(filtered);
  }

  function renderTable(responses) {
      const tbody = document.getElementById('tableBody');
      if(!tbody) return;

      if (responses.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No matching tasks found.</td></tr>';
          return;
      }

      tbody.innerHTML = responses.map(r => `
          <tr>
              <td><strong>${escapeHtml(r.refID)}</strong></td>
              <td>
                  <div style="font-weight: 600; color: #111; margin-bottom: 3px;">${escapeHtml(r.activity)}</div>
                  ${r.parentDoc ? `<span style="font-size:11px; background:#e6f2ed; color:#0b5f3c; padding:2px 6px; border-radius:4px;">📎 Linked Doc</span>` : ''}
                  ${r.relatedEmails.length > 0 ? `<span style="font-size:11px; background:#fff3cd; color:#856404; padding:2px 6px; border-radius:4px;">📧 ${r.relatedEmails.length} Emails</span>` : ''}
              </td>
              <td>${escapeHtml(r.assignedTo)}</td>
              <td>${escapeHtml(r.category)}</td>
              <td>${formatDate(r.dueDate)}</td>
              <td>
                  <span class="status-badge ${getStatusClass(r.displayStatus)}">
                      ${escapeHtml(r.displayStatus)}
                  </span>
              </td>
              <td>
                  <div class="action-buttons">
                      ${(r.displayStatus === 'Pending' || r.displayStatus === 'Overdue' || r.displayStatus === 'Not started') ? 
                          `<button class="action-btn action-btn-primary" onclick="openAckModal(${r.id})">Acknowledge</button>` : 
                          `<button class="action-btn action-btn-secondary" disabled>Treated</button>`
                      }
                      <button class="action-btn action-btn-secondary" onclick="viewDetails(${r.id})">Matrix View</button>
                  </div>
              </td>
          </tr>
      `).join('');
  }

  window.openAckModal = function(taskId) {
      state.selectedTask = state.matrix.find(r => r.id === taskId);
      if (!state.selectedTask) return;
      document.getElementById('ackEmail').value = state.userEmail;
      document.getElementById('ackNotes').value = '';
      document.getElementById('ackModal').classList.add('active');
  }

  window.closeAckModal = function() {
      const m = document.getElementById('ackModal');
      if(m) m.classList.remove('active');
      state.selectedTask = null;
  }

  window.handleAckSubmit = async function(event) {
      event.preventDefault();
      if (!state.selectedTask) return;

      const email = document.getElementById('ackEmail').value;
      const notes = document.getElementById('ackNotes').value;
      const btn = event.target.querySelector('button[type="submit"]');
      
      btn.textContent = 'Processing...';
      btn.disabled = true;

      try {
          // Route the acknowledgement through the central gateway write path
          // (E05 → Outbox). Queues locally and syncs when the flow is provisioned.
          await window.API.callPA('E05', {
              taskId: state.selectedTask.id,
              status: 'Acknowledged',
              acknowledgedBy: email,
              notes: notes || 'Acknowledged via Response Tracking.'
          });
          state.selectedTask.status = 'Acknowledged';
          state.selectedTask.displayStatus = 'Acknowledged';

          showNotification('Task acknowledged successfully', 'success');
          closeAckModal();
          window.applyFilters();
      } catch (error) {
          console.error('Error:', error);
          showNotification('Failed to acknowledge response', 'error');
      } finally {
          btn.textContent = 'Acknowledge';
          btn.disabled = false;
      }
  }

  window.viewDetails = function(taskId) {
      const task = state.matrix.find(r => r.id === taskId);
      if (!task) return;

      const content = document.getElementById('detailsContent');
      if(!content) return;
      
      content.innerHTML = `
          <div class="matrix-section" style="background: #fff; border-left: 4px solid #00A69D;">
              <h3><span style="font-size: 18px;">📌</span> Task Origin Node</h3>
              <div class="matrix-meta"><strong>Title:</strong> ${escapeHtml(task.activity)}</div>
              <div class="matrix-meta"><strong>Description:</strong> ${escapeHtml(task.description || 'No specific description provided.')}</div>
              <div style="display:flex; gap: 15px; margin-top: 10px; flex-wrap: wrap;">
                  <span class="matrix-meta"><strong>Ref ID:</strong> <span style="background: #e0e0e0; padding: 2px 6px; border-radius: 4px;">${escapeHtml(task.refID)}</span></span>
                  <span class="matrix-meta"><strong>Priority:</strong> ${escapeHtml(task.priority)}</span>
                  <span class="matrix-meta"><strong>Assigned:</strong> ${escapeHtml(task.assignedTo)}</span>
                  <span class="matrix-meta"><strong>DSU Routing:</strong> ${escapeHtml(task.routing)}</span>
              </div>
          </div>
          <div class="matrix-section">
              <h3><span style="font-size: 18px;">📄</span> Ancestor Document Lineage</h3>
              ${task.parentDoc ? `
                  <div class="matrix-meta"><strong>Title:</strong> ${escapeHtml(task.parentDoc.title)}</div>
                  <div class="matrix-meta"><strong>Category:</strong> ${escapeHtml(task.parentDoc.category)}</div>
                  <div class="matrix-meta"><strong>Global Status:</strong> ${escapeHtml(task.parentDoc.status)}</div>
                  ${task.parentDoc.link ? `<a href="${task.parentDoc.link}" target="_blank" style="display:inline-block; margin-top:10px; color:#05583B; font-weight:600; text-decoration:none;">🔗 Open Original Document in SharePoint</a>` : ''}
              ` : `
                  <div class="matrix-meta" style="color: #666; font-style: italic;">No primary parent document explicitly mapped to this RefIDD (${escapeHtml(task.refIDD)}). This task may have originated independently.</div>
              `}
          </div>
          <div class="matrix-section">
              <h3><span style="font-size: 18px;">📧</span> Communication Sibling Threads (${task.relatedEmails.length})</h3>
              ${task.relatedEmails.length > 0 ? task.relatedEmails.map(e => `
                  <div class="email-thread">
                      <h4>${escapeHtml(e.subject)}</h4>
                      <div class="matrix-meta" style="font-size: 11px;"><strong>From:</strong> ${escapeHtml(e.from)} &bull; <strong>Received:</strong> ${formatDate(e.received)}</div>
                      <div class="email-preview">${escapeHtml(e.body)}</div>
                  </div>
              `).join('') : `
                  <div class="matrix-meta" style="color: #666; font-style: italic;">No active email threads correlate with this execution node.</div>
              `}
          </div>
      `;

      document.getElementById('detailsModal').classList.add('active');
  }

  window.closeDetailsModal = function() {
      const m = document.getElementById('detailsModal');
      if(m) m.classList.remove('active');
  }

  function showNotification(message, type = 'info') {
      const n = document.getElementById('notification');
      if(!n) return;
      n.textContent = message;
      n.className = `notification show ${type}`;
      setTimeout(() => n.classList.remove('show'), 5000);
  }

  window.goBack = function() {
      // In standalone SPA, just show an alert
      alert("This operates as the root SPA view. Navigation back requires external routing.");
  }

  document.addEventListener('DOMContentLoaded', () => {
      // Bind event listeners that were inline
      const fStatus = document.getElementById('filterAckStatus');
      if(fStatus) fStatus.addEventListener('change', window.applyFilters);
      const fCat = document.getElementById('filterCategory');
      if(fCat) fCat.addEventListener('change', window.applyFilters);
      const fSearch = document.getElementById('filterSearch');
      if(fSearch) fSearch.addEventListener('keyup', window.applyFilters);
      
      updateAvatar();
      window.syncData();
      window.addEventListener('dgo:data-refreshed', () => window.syncData()); // in-place re-render
  });

})();
