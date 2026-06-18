/* Externalized page logic for bulk-assign.html (ARC-02 / SEC-03).
   Moved verbatim from the page's inline <script type="module"> block(s); no behavior
   change — handler functions remain window-attached. Page logic now lives in a real
   module file instead of an inline per-page monolith. */

      document.addEventListener('DOMContentLoaded', async () => {
        window.Chrome.bootstrap('docs'); // Keeps highlight on Docs section

        let selectedDocIds = [];
        let batchDocuments = [];
        let officers = [];
        let depts = [];
        let categories = [];
        let currentStrategy = 'direct';
        let optimizedAllocationResults = [];

        // Parse query params '?ids=DOC-xxxx,DOC-yyyy'
        const params = new URLSearchParams(window.location.search);
        const idsStr = params.get('ids');
        if (idsStr) {
          selectedDocIds = idsStr.split(',').filter(Boolean);
        }

        document.getElementById('batch-loaded-count').textContent = selectedDocIds.length;

        // Initialize drop references
        try {
          const refs = await window.Lookups.loadReferences();
          officers = refs.officers || [];
          depts = refs.departments || [];
          categories = refs.categories || [];

          // Uniform categories select
          const dirCatSelect = document.getElementById('dir-frm-category');
          dirCatSelect.innerHTML += categories.map(c => `
            <option value="${c.code}">${Sanitizer.escape(c.name)}</option>
          `).join('');

          // Load documents details from API
          const allDocsResp = await window.API.callPA('E02');
          const allDocs = allDocsResp?.records || [];
          
          batchDocuments = allDocs.filter(doc => selectedDocIds.includes(doc.id));
          renderBatchDocsTable();

        } catch(err) {
          window.Chrome.showToast('Reference lookups sync failed.', 'error');
        }

        // Render batch loaders
        function renderBatchDocsTable() {
          const tbody = document.getElementById('batch-docs-tbody');
          if (batchDocuments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--dgo-color-fg-subtle);">No documents found inside this batch. Navigate back to Dossiers.</td></tr>`;
            return;
          }

          tbody.innerHTML = batchDocuments.map(doc => {
            const catLabel = categories.find(c => c.code === doc.category)?.name || doc.category;
            return `
              <tr>
                <td><code style="background:var(--dgo-color-surface-sunken); padding:2px 6px; border-radius:4px;">${Sanitizer.escape(doc.id)}</code></td>
                <td>
                  <div class="dgo-stack dgo-stack--0" style="font-size:var(--dgo-type-body-sm);">
                    <strong style="color:var(--dgo-color-fg-strong);">${Sanitizer.escape(doc.title)}</strong>
                    <span style="font-size:10px; color:var(--dgo-color-fg-muted);">${Sanitizer.escape(doc.sender)}</span>
                  </div>
                </td>
                <td><span style="font-size:var(--dgo-type-body-sm);">${catLabel}</span></td>
              </tr>
            `;
          }).join('');
        }

        // Auto selection on direct category cascade
        document.getElementById('dir-frm-category').addEventListener('change', (e) => {
          const code = e.target.value;
          const cascade = window.Lookups.resolveCategoryCascade(code);
          if (cascade) {
            document.getElementById('dir-frm-assignee').value = cascade.defaultAssigneeName;
            document.getElementById('dir-frm-assignee-val').value = cascade.defaultAssigneeId;
            document.getElementById('dir-frm-priority').value = cascade.defaultPriority;
            document.getElementById('btn-dir-clear-assign').style.display = 'inline-block';
            window.Chrome.showToast('Uniform direct cascade values proposed.', 'success');
          }
        });

        // Setup autocomplete
        setupAutocompleteInput('dir-frm-assignee', 'dir-suggest-assignee', 'dir-frm-assignee-val', 'btn-dir-clear-assign');

        function setupAutocompleteInput(inputId, dropdownId, hiddenValId, clearId) {
          const input = document.getElementById(inputId);
          const dropdown = document.getElementById(dropdownId);
          const hidden = document.getElementById(hiddenValId);
          const clear = document.getElementById(clearId);

          input.addEventListener('input', (event) => {
            const q = event.target.value.toLowerCase();
            if (!q) {
              dropdown.style.display = 'none';
              return;
            }

            const matched = officers.filter(o => 
              o.name.toLowerCase().includes(q) || 
              o.role.toLowerCase().includes(q) || 
              o.id.toLowerCase().includes(q)
            );

            if (matched.length === 0) {
              dropdown.innerHTML = `<div style="padding: 8px; font-size:12px; color: var(--dgo-color-fg-subtle);">No matching official registry profiles</div>`;
              dropdown.style.display = 'block';
              return;
            }

            dropdown.innerHTML = matched.map(o => `
              <div class="dgo-autocomplete__item" data-id="${Sanitizer.escape(o.id)}" data-name="${Sanitizer.escape(o.name)}">
                <p style="font-size: var(--dgo-type-body-sm); font-weight:600;">${Sanitizer.escape(o.name)}</p>
                <p style="font-size: 10px; color: var(--dgo-color-fg-muted);">${Sanitizer.escape(o.role)}</p>
              </div>
            `).join('');

            dropdown.style.display = 'block';

            dropdown.querySelectorAll('.dgo-autocomplete__item').forEach(el => {
              el.addEventListener('click', () => {
                const id = el.getAttribute('data-id');
                const name = el.getAttribute('data-name');
                input.value = name;
                hidden.value = id;
                dropdown.style.display = 'none';
                if (clear) clear.style.display = 'inline-block';
              });
            });
          });

          if (clear) {
            clear.addEventListener('click', () => {
              input.value = '';
              hidden.value = '';
              clear.style.display = 'none';
            });
          }

          document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
              dropdown.style.display = 'none';
            }
          });
        }

        // Broadcaster E07 dispatches
        document.getElementById('btn-dispatch-direct').addEventListener('click', async () => {
          const form = document.getElementById('direct-broadcast-form');
          if (!form.reportValidity()) return;

          if (batchDocuments.length === 0) {
            window.Chrome.showToast('Loaded batch empty.', 'warning');
            return;
          }

          try {
            window.Chrome.showToast('Broadcasting Direct Route (E07)...');
            
            const assignee = document.getElementById('dir-frm-assignee-val').value || document.getElementById('dir-frm-assignee').value;
            const category = document.getElementById('dir-frm-category').value;
            const priority = document.getElementById('dir-frm-priority').value;
            const directives = document.getElementById('dir-frm-directives').value;

            const payload = {
              documentIds: selectedDocIds,
              assignee,
              category,
              priority,
              directives
            };

            const response = await window.API.callPA('E07', payload);
            if (response.success) {
              window.Chrome.showToast('Bulk broadcast queued — syncing…', 'success');
              setTimeout(() => {
                window.location.href = 'tasks.html';
              }, 1200);
            } else {
              window.Chrome.showToast('Gateway rejected bulk broadcast request.', 'error');
            }
          } catch(err) {
            window.Chrome.showToast(err.message, 'error');
          }
        });

        // AI analyzer E08 simulation builds
        document.getElementById('btn-trigger-optimization').addEventListener('click', async () => {
          if (batchDocuments.length === 0) {
            window.Chrome.showToast('Bulk batch loader empty.', 'warning');
            return;
          }

          try {
            window.Chrome.showToast('Executing AI Allocation matrices E08...');
            
            const payload = {
              documentIds: selectedDocIds
            };

            const response = await window.API.callPA('E08', payload);
            optimizedAllocationResults = response.allocations || [];

            renderOptimizedAIPane();
            document.getElementById('ai-dispatch-controls').style.display = 'block';
            window.Chrome.showToast('AI Allocations mapped successfully!', 'success');

          } catch(err) {
            window.Chrome.showToast('Optimization analysis failed.', 'error');
          }
        });

        function renderOptimizedAIPane() {
          const pane = document.getElementById('ai-optimized-results-pane');
          if (optimizedAllocationResults.length === 0) {
            pane.innerHTML = `<p>AI optimization compiled clean results.</p>`;
            return;
          }

          pane.innerHTML = optimizedAllocationResults.map((alloc, idx) => {
            const officerOptions = officers.map(o => `
              <option value="${Sanitizer.escape(o.id)}" ${o.id === alloc.proposedAssigneeId ? 'selected' : ''}>${Sanitizer.escape(o.name)}</option>
            `).join('');

            return `
              <div class="dgo-card dgo-stack dgo-stack--2" style="border-left: 3.5px solid var(--dgo-color-action-accent); padding: var(--dgo-s-3); margin-bottom:var(--dgo-s-1);">
                <div class="dgo-cluster dgo-cluster--between">
                  <code style="background:var(--dgo-color-surface-sunken); padding:2px 4px; border-radius:4px; font-weight:700; font-size:11px;">${alloc.documentId}</code>
                  <div class="dgo-cluster dgo-cluster--density">
                    <span style="font-size:10px; color:var(--dgo-color-fg-muted);">Confidence Score:</span>
                    <span class="dgo-badge dgo-badge--replied" style="font-size:10px; padding-inline:4px; font-weight:700;">${Math.round(alloc.confidenceScore * 100)}%</span>
                  </div>
                </div>

                <div class="dgo-stack dgo-stack--1">
                  <span style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--dgo-color-fg-muted);">Dossier text</span>
                  <span style="font-weight:600; font-size:13px; color:var(--dgo-color-fg-strong);">${Sanitizer.escape(alloc.title)}</span>
                </div>

                <div class="dgo-grid dgo-grid--2" style="gap:var(--dgo-s-2); margin-top:var(--dgo-s-1);">
                  <div class="dgo-form-group">
                    <label class="dgo-label" style="font-size:9px; text-transform:uppercase;">Proposed Executor</label>
                    <select class="dgo-select sel-ai-assignee" data-index="${idx}" style="height:32px; font-size:11px; padding-inline: var(--dgo-s-2);">
                      ${officerOptions}
                    </select>
                  </div>
                  <div class="dgo-form-group">
                    <label class="dgo-label" style="font-size:9px; text-transform:uppercase;">SLA Timer (Days)</label>
                    <input type="number" class="dgo-input inp-ai-deadline" data-index="${idx}" style="height:32px; font-size:11px; padding-inline: var(--dgo-s-2);" value="${alloc.proposedDeadlineDays}" min="1" max="90">
                  </div>
                </div>
              </div>
            `;
          }).join('');

          // Bind local adjustments
          pane.querySelectorAll('.sel-ai-assignee').forEach(sel => {
            sel.addEventListener('change', (e) => {
              const idx = parseInt(sel.getAttribute('data-index'));
              optimizedAllocationResults[idx].proposedAssigneeId = e.target.value;
            });
          });

          pane.querySelectorAll('.inp-ai-deadline').forEach(inp => {
            inp.addEventListener('input', (e) => {
              const idx = parseInt(inp.getAttribute('data-index'));
              optimizedAllocationResults[idx].proposedDeadlineDays = parseInt(e.target.value) || 7;
            });
          });
        }

        // Apply Optimized Routing Dispatch E08
        document.getElementById('btn-dispatch-optimized').addEventListener('click', async () => {
          if (optimizedAllocationResults.length === 0) return;

          try {
            window.Chrome.showToast('Routing dispatch optimizations...');
            
            const payload = {
              allocations: optimizedAllocationResults.map(a => ({
                documentId: a.documentId,
                assigneeId: a.proposedAssigneeId,
                deadlineDays: a.proposedDeadlineDays
              }))
            };

            const response = await window.API.callPA('E08_COMMIT', payload);
            if (response.success) {
              window.Chrome.showToast('Allocations queued — syncing…', 'success');
              setTimeout(() => {
                window.location.href = 'tasks.html';
              }, 1200);
            } else {
              window.Chrome.showToast('Operational gate rejected optimized allocations.', 'error');
            }

          } catch(err) {
            window.Chrome.showToast(err.message, 'error');
          }
        });

        // Tabs managers
        window.switchStrategyTab = (tab) => {
          currentStrategy = tab;
          const directDiv = document.getElementById('strategy-direct');
          const optDiv = document.getElementById('strategy-optimized');

          const btnDir = document.getElementById('tab-btn-direct');
          const btnOpt = document.getElementById('tab-btn-optimized');

          directDiv.style.display = 'none';
          optDiv.style.display = 'none';

          btnDir.classList.remove('dgo-tab--active');
          btnOpt.classList.remove('dgo-tab--active');

          if (tab === 'direct') {
            directDiv.style.display = 'block';
            btnDir.classList.add('dgo-tab--active');
          } else {
            optDiv.style.display = 'block';
            btnOpt.classList.add('dgo-tab--active');
          }
        };

      });
