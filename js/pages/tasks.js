/* Externalized page logic for tasks.html (ARC-02 / SEC-03).
   Moved verbatim from the page's inline <script type="module"> block(s); no behavior
   change — handler functions remain window-attached. Page logic now lives in a real
   module file instead of an inline per-page monolith. */

      document.addEventListener('DOMContentLoaded', async () => {
        window.Chrome.bootstrap('tasks');

        let tasks = [];
        let selectedTask = null;
        let closeTrapFn = null;

        // Fetch tasks list E04
        async function fetchAndRender() {
          try {
            const status = document.getElementById('task-status-filter').value;
            document.getElementById('tasks-tbody').innerHTML = `
              <tr>
                <td colspan="4" style="text-align: center; color: var(--dgo-color-fg-subtle);">Fetching fresh assignments stream...</td>
              </tr>
            `;

            const response = await window.API.callPA('E04', { status });
            tasks = response?.records || [];

            document.getElementById('tasks-count-text').textContent = `${tasks.length} action items identified`;
            renderGrid();
          } catch(err) {
            window.Chrome.showToast('Failed to load assignments.', 'error');
          }
        }

        function renderGrid() {
          const tbody = document.getElementById('tasks-tbody');
          if (tasks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--dgo-color-fg-subtle);">No matching assignments active.</td></tr>`;
            return;
          }

          tbody.innerHTML = tasks.map(t => {
            const officers = window.Lookups.getOfficers();
            const officer = officers.find(o => o.id === t.assignee);
            return `
              <tr class="task-row" data-id="${Sanitizer.escape(t.id)}" style="cursor: pointer;">
                <td><code style="background: var(--dgo-color-surface-sunken); padding: 2px 6px; border-radius: 4px;">${Sanitizer.escape(t.id)}</code></td>
                <td>
                  <div class="dgo-stack dgo-stack--0">
                    <span style="font-weight: 600; font-size:var(--dgo-type-body-sm);">${Sanitizer.escape(t.title)}</span>
                    <span style="font-size:10px; color: var(--dgo-color-fg-muted);">Owner: ${Sanitizer.escape(officer ? officer.name : t.assignee)}</span>
                  </div>
                </td>
                <td style="vertical-align: middle;">
                  <div class="dgo-cluster dgo-cluster--density" style="flex-wrap:nowrap;">
                    <span style="font-family: var(--dgo-family-mono); font-size: 11px; width: 36px; text-align:right;">${t.progress}%</span>
                    <div style="flex:1; height: 6px; background: var(--dgo-color-border-default); border-radius: 9px; overflow:hidden; min-width: 60px;">
                      <div style="width: ${t.progress}%; height: 100%; background: var(--dgo-color-action-accent); border-radius:inherit;"></div>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="dgo-badge dgo-badge--${t.priority === 'HIGH' ? 'action' : (t.priority === 'MEDIUM' ? 'routed' : 'draft')}">${Sanitizer.escape(t.priority)}</span>
                </td>
              </tr>
            `;
          }).join('');

          // Click handler
          tbody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('click', () => {
              const id = row.getAttribute('data-id');
              const found = tasks.find(t => t.id === id);
              if (found) selectTask(found);
            });
          });
        }

        // Render Side details panel
        function selectTask(t) {
          selectedTask = t;

          document.querySelectorAll('.task-row').forEach(row => {
            if (row.getAttribute('data-id') === t.id) {
              row.style.background = 'var(--dgo-green-50)';
            } else {
              row.style.background = '';
            }
          });

          const pane = document.getElementById('task-details-pane');
          const officers = window.Lookups.getOfficers();
          const pOfficer = officers.find(o => o.id === t.assignee);
          const cOfficer = officers.find(o => o.id === t.coAssignee);
          
          const cats = window.Lookups.getCategories();
          const category = cats.find(c => c.code === t.category);

          pane.innerHTML = `
            <div class="dgo-stack dgo-stack--4">
              <!-- Header -->
              <div class="dgo-cluster dgo-cluster--between">
                <h3 class="dgo-h4">Activity Directives</h3>
                <span class="dgo-badge dgo-badge--${t.status === 'COMPLETED' ? 'replied' : (t.status === 'ROUTED' ? 'routed' : 'pending')}">${Sanitizer.escape(t.status)}</span>
              </div>

              <!-- Ref -->
              <div class="dgo-cluster dgo-cluster--between" style="border-bottom:1px solid var(--dgo-color-border-default); padding-bottom:var(--dgo-s-3);">
                <div class="dgo-stack dgo-stack--0">
                  <span class="dgo-overline">Task Reference</span>
                  <code style="font-size:13px; font-weight:600; background:var(--dgo-color-surface-sunken); padding:2px 6px; border-radius:4px;">${Sanitizer.escape(t.id)}</code>
                </div>
                <div class="dgo-stack dgo-stack--0" style="text-align:right;">
                  <span class="dgo-overline">Dossier Association</span>
                  <a class="dgo-link text-strong" style="font-family: var(--dgo-family-mono); font-size:12px;" href="docs.html">${t.documentId}</a>
                </div>
              </div>

              <div class="dgo-stack dgo-stack--1">
                <span class="dgo-overline">Directives Title</span>
                <p class="dgo-body-sm text-strong">${Sanitizer.escape(t.title)}</p>
              </div>

              <div class="dgo-stack dgo-stack--1">
                <span class="dgo-overline">Process Class</span>
                <p class="dgo-body-sm">${Sanitizer.escape(category ? category.name : t.category)}</p>
              </div>

              <div class="dgo-grid dgo-grid--2" style="font-size: var(--dgo-type-body-sm); gap: var(--dgo-s-3);">
                <div class="dgo-stack dgo-stack--1">
                  <span class="dgo-overline">Lead Assignee</span>
                  <span class="text-strong">${Sanitizer.escape(pOfficer ? pOfficer.name : t.assignee)}</span>
                </div>
                <div class="dgo-stack dgo-stack--1">
                  <span class="dgo-overline">Co-Assignee</span>
                  <span class="text-muted">${Sanitizer.escape(cOfficer ? cOfficer.name : (t.coAssignee || 'None'))}</span>
                </div>
              </div>

              <div class="dgo-stack dgo-stack--1">
                <span class="dgo-overline">Carbon Copy Watch (CC)</span>
                <span class="text-muted">${t.cc && t.cc.length > 0 ? t.cc.join(', ') : 'None'}</span>
              </div>

              <div class="dgo-stack dgo-stack--1" style="background:var(--dgo-color-surface-sunken); padding: var(--dgo-s-3); border-radius: var(--dgo-radius-control); border-left: 3px solid var(--dgo-color-border-brand);">
                <span class="dgo-overline" style="margin-bottom:var(--dgo-s-1);">DG Standing Mandate</span>
                <p class="dgo-body-sm" style="font-style:italic; white-space:pre-wrap; line-height:1.4;">"${Sanitizer.escape(t.directives || 'No directives recorded.')}"</p>
              </div>

              <div class="dgo-stack dgo-stack--1">
                <span class="dgo-overline">Milestone Completion Progress</span>
                <div class="dgo-cluster dgo-cluster--density" style="flex-wrap:nowrap;">
                  <span style="font-family:var(--dgo-family-mono); font-weight:700; font-size:15px; width:40px;">${t.progress}%</span>
                  <div style="flex:1; height: 8px; background: var(--dgo-color-border-default); border-radius: 9px; overflow:hidden;">
                    <div style="width: ${t.progress}%; height: 100%; background: var(--dgo-color-action-accent); border-radius:inherit;"></div>
                  </div>
                </div>
              </div>

              ${t.lastUpdateNotes ? `
                <div class="dgo-stack dgo-stack--1" style="border-top:1px dashed var(--dgo-color-border-default); padding-top:var(--dgo-s-3);">
                  <span class="dgo-overline">Latest Owner Log comments</span>
                  <p class="dgo-body-sm text-muted" style="white-space:pre-wrap;">"${Sanitizer.escape(t.lastUpdateNotes)}"</p>
                  <span class="dgo-caption" style="font-size:10px;">Submitted: ${new Date(t.updatedAt).toLocaleString()}</span>
                </div>
              ` : ''}

              <!-- Action button -->
              <div style="border-top:1px solid var(--dgo-color-border-default); padding-top: var(--dgo-s-4); margin-top:var(--dgo-s-2);">
                <button class="dgo-btn dgo-btn--md dgo-btn--primary" style="width:100%;" data-act="openProgressModal">
                  <svg style="width:16px; height:16px;"><use href="assets/icons/sprite.svg#i-edit"></use></svg>
                  <span>Update Progress / Comments</span>
                </button>
              </div>
            </div>
          `;
        }

        // Progress Modal controllers
        const modal = document.getElementById('modal-task-progress-overlay');
        const range = document.getElementById('frm-prog-range');
        const num = document.getElementById('frm-prog-val');

        range.addEventListener('input', (e) => {
          num.value = e.target.value;
        });
        num.addEventListener('input', (e) => {
          range.value = e.target.value;
        });

        window.openProgressModal = () => {
          document.getElementById('frm-prog-range').value = selectedTask.progress;
          document.getElementById('frm-prog-val').value = selectedTask.progress;
          document.getElementById('frm-status-val').value = selectedTask.status;
          document.getElementById('frm-notes-val').value = selectedTask.lastUpdateNotes || '';

          modal.classList.add('dgo-modal-overlay--active');
          closeTrapFn = window.A11y.trapFocus(modal.querySelector('.dgo-modal'));
        };

        window.closeProgressModal = () => {
          modal.classList.remove('dgo-modal-overlay--active');
          if (closeTrapFn) {
            closeTrapFn();
            closeTrapFn = null;
          }
        };

        // Submit update E05 trigger
        document.getElementById('btn-submit-task-update').addEventListener('click', async () => {
          const notes = document.getElementById('frm-notes-val').value;
          if (!notes) {
            window.Chrome.showToast('Please provide operational comments.', 'warning');
            return;
          }

          try {
            window.Chrome.showToast('Triggering Task Update...');
            const progress = parseInt(num.value);
            const status = document.getElementById('frm-status-val').value;

            const payload = {
              taskId: selectedTask.id,
              progress,
              status,
              notes
            };

            const response = await window.API.callPA('E05', payload);
            if (response.success) {
              window.Chrome.showToast('Progress updated successfully!', 'success');
              closeProgressModal();

              // Local cache updates
              selectedTask.progress = progress;
              selectedTask.status = status;
              selectedTask.lastUpdateNotes = notes;
              selectedTask.updatedAt = new Date().toISOString();

              const stored = window.API.getStoredTasks();
              const idx = stored.findIndex(t => t.id === selectedTask.id);
              if (idx !== -1) {
                stored[idx].progress = progress;
                stored[idx].status = status;
                stored[idx].lastUpdateNotes = notes;
                stored[idx].updatedAt = selectedTask.updatedAt;
                window.API.saveStoredTasks(stored);
              }

              // Re-render
              renderGrid();
              selectTask(selectedTask);
            } else {
              window.Chrome.showToast('Gateway rejected progress update.', 'error');
            }
          } catch(err) {
            window.Chrome.showToast(err.message, 'error');
          }
        });

        // Event hooks
        document.getElementById('task-status-filter').addEventListener('change', fetchAndRender);
        document.getElementById('btn-sync-tasks').addEventListener('click', fetchAndRender);

        // Initial loading loop
        await fetchAndRender();
        window.addEventListener('dgo:data-refreshed', fetchAndRender); // in-place re-render
      });
