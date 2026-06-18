/* Externalized page logic for docs.html (ARC-02 / SEC-03).
   Moved verbatim from the page's inline <script type="module"> block(s); no behavior
   change — handler functions remain window-attached. Page logic now lives in a real
   module file instead of an inline per-page monolith. */

      document.addEventListener('DOMContentLoaded', async () => {
        window.Chrome.bootstrap('docs');

        let documents = [];
        let currentlySelectedDoc = null;
        let checkedIds = new Set();
        let closeTrapFn = null;

        // Initialize Filter Dropdown dynamically with Lookups categories
        const categoryFilter = document.getElementById('category-filter');
        const categories = window.Lookups.getCategories();
        categoryFilter.innerHTML += categories.map(c => `
          <option value="${c.code}">${Sanitizer.escape(c.name)}</option>
        `).join('');

        // Fetch dynamic document records E02
                async function fetchAndRender() {
          const tbody = document.getElementById('docs-tbody');
          const search = document.getElementById('search-input').value;
          const category = document.getElementById('category-filter').value;
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Syncing Secure OData Stream...</td></tr>';
          try {
            const data = await window.API.callPA('E02', { search, category, pagination: { top: 50, skip: 0 } });
            const documents = data?.records || [];
            tbody.innerHTML = '';
            documents.forEach(doc => {
              const row = Sanitizer.createRow([
                { content: `<input type="checkbox" class="doc-checkbox" data-id="${Sanitizer.escape(doc.id)}">`, isHTML: true, className: 'checkbox-cell' },
                { content: doc.id, className: 'font-mono' },
                { content: doc.title, className: 'text-strong' },
                { content: doc.category },
                { content: `<span class="dgo-badge dgo-badge--${doc.status.toLowerCase()}">${Sanitizer.escape(doc.status)}</span>`, isHTML: true }
              ]);
              row.addEventListener('click', (e) => {
                if (!e.target.classList.contains('doc-checkbox')) selectDossier(doc);
              });
              tbody.appendChild(row);
            });
          } catch (err) {
            window.Chrome.showToast('Failed to load OData stream.', 'error');
          }
        }

        // Render main dossiers table rows
        function renderGrid() {
          const tbody = document.getElementById('docs-tbody');
          if (documents.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--dgo-color-fg-subtle);">No matching dossiers found.</td></tr>`;
            return;
          }

          tbody.innerHTML = documents.map(doc => {
            const isChecked = checkedIds.has(doc.id);
            const flagBadge = doc.flag ? getFlagBadgeMarkup(doc.flag) : '';
            return `
              <tr class="doc-row" data-id="${Sanitizer.escape(doc.id)}" style="cursor: pointer;">
                <td style="text-align: center;" class="checkbox-cell">
                  <input type="checkbox" class="doc-checkbox" data-id="${Sanitizer.escape(doc.id)}" ${isChecked ? 'checked' : ''} style="transform: scale(1.1); cursor:pointer;">
                </td>
                <td><code style="background: var(--dgo-color-surface-sunken); padding: 2px 6px; border-radius: 4px;">${Sanitizer.escape(doc.id)}</code></td>
                <td>
                  <div class="dgo-stack dgo-stack--0">
                    <span style="font-weight: 600; font-size:var(--dgo-type-body-sm);">${Sanitizer.escape(doc.title)}</span>
                    <span style="font-size:10px; color: var(--dgo-color-fg-muted);">${Sanitizer.escape(doc.sender)}</span>
                  </div>
                </td>
                <td>
                  <span style="font-size: var(--dgo-type-body-sm);">${getCategoryLabel(doc.category)}</span>
                </td>
                <td>
                  <div class="dgo-cluster dgo-cluster--density">
                    <span class="dgo-badge dgo-badge--${doc.status.toLowerCase()}">${Sanitizer.escape(doc.status)}</span>
                    ${flagBadge}
                  </div>
                </td>
              </tr>
            `;
          }).join('');

          // Bind click listeners
          tbody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('click', (e) => {
              // Ignore if click was inside checkboxes column
              if (e.target.closest('.checkbox-cell') || e.target.classList.contains('doc-checkbox')) {
                return;
              }
              const id = row.getAttribute('data-id');
              const found = documents.find(d => d.id === id);
              if (found) selectDossier(found);
            });
          });

          // Bind checkboxes
          tbody.querySelectorAll('.doc-checkbox').forEach(box => {
            box.addEventListener('change', (e) => {
              const id = box.getAttribute('data-id');
              if (box.checked) {
                checkedIds.add(id);
              } else {
                checkedIds.delete(id);
              }
              updateBulkBanner();
            });
          });
        }

        function getCategoryLabel(code) {
          const cat = categories.find(c => c.code === code);
          return cat ? cat.name : code;
        }

        function getFlagBadgeMarkup(flag) {
          switch (flag) {
            case 'FOR_DG': return `<span class="dgo-badge dgo-badge--pending" style="font-size:10px; height:18px;">FOR DG</span>`;
            case 'FW_UP':  return `<span class="dgo-badge dgo-badge--routed"  style="font-size:10px; height:18px;">FW-UP</span>`;
            case 'INT':    return `<span class="dgo-badge dgo-badge--draft"   style="font-size:10px; height:18px;">INTERNAL</span>`;
            case 'UNC':    return `<span class="dgo-badge dgo-badge--action"  style="font-size:10px; height:18px;">UNCLASS</span>`;
            default: return '';
          }
        }

        // Render Side Inspection Drawer
        function selectDossier(doc) {
          currentlySelectedDoc = doc;
          
          // Style current table selected row
          document.querySelectorAll('.doc-row').forEach(row => {
            if (row.getAttribute('data-id') === doc.id) {
              row.style.background = 'var(--dgo-green-50)';
            } else {
              row.style.background = '';
            }
          });

          const pane = document.getElementById('inspection-pane');
          const officers = window.Lookups.getOfficers();
          const officer = officers.find(o => o.id === doc.assignedTo);

          let flagSection = `<span style="font-size:var(--dgo-type-body-sm); color: var(--dgo-color-fg-subtle);">None</span>`;
          if (doc.flag) {
            flagSection = `
              <div class="dgo-stack dgo-stack--1">
                <div class="dgo-cluster dgo-cluster--density">
                  ${getFlagBadgeMarkup(doc.flag)}
                  <span style="font-size: 11px; color: var(--dgo-color-fg-muted);">Flagged by ${doc.flaggedBy || 'System'}</span>
                </div>
                <span class="dgo-caption" style="font-size: 10px;">Date updated: ${new Date(doc.flaggedDate).toLocaleString()}</span>
              </div>
            `;
          }

          pane.innerHTML = `
            <div class="dgo-stack dgo-stack--4">
              <!-- Pane Header -->
              <div class="dgo-cluster dgo-cluster--between">
                <h3 class="dgo-h4">Dossier Details</h3>
                <span class="dgo-badge dgo-badge--${doc.status.toLowerCase()}">${Sanitizer.escape(doc.status)}</span>
              </div>

              <!-- Ref ID block -->
              <div class="dgo-stack dgo-stack--1">
                <span class="dgo-overline">Dossier Reference</span>
                <code style="background:var(--dgo-color-surface-sunken); padding: 4px var(--dgo-s-2); font-size:13px; border-radius:4px; font-weight:600;">${Sanitizer.escape(doc.id)}</code>
              </div>

              <div class="dgo-stack dgo-stack--1">
                <span class="dgo-overline">Sender</span>
                <p class="dgo-body-sm text-strong">${Sanitizer.escape(doc.sender)}</p>
              </div>

              <div class="dgo-stack dgo-stack--1">
                <span class="dgo-overline">Subject / Registry Title</span>
                <p class="dgo-body-sm" style="font-weight: 500;">${Sanitizer.escape(doc.title)}</p>
              </div>

              <div class="dgo-stack dgo-stack--1">
                <span class="dgo-overline">Metadata Category</span>
                <p class="dgo-body-sm">${getCategoryLabel(doc.category)}</p>
              </div>

              <div class="dgo-stack dgo-stack--1">
                <span class="dgo-overline">Active Operation Flag</span>
                ${flagSection}
              </div>

              <div class="dgo-stack dgo-stack--1">
                <span class="dgo-overline">Date Logged</span>
                <p class="dgo-body-sm">${new Date(doc.dateReceived).toLocaleString()}</p>
              </div>

              ${doc.assignedTo ? `
                <div class="dgo-stack dgo-stack--1">
                  <span class="dgo-overline">Active Assigned Lead</span>
                  <p class="dgo-body-sm" style="font-weight: 600; color: var(--dgo-color-action-primary);">${Sanitizer.escape(officer ? officer.name : doc.assignedTo)}</p>
                </div>
              ` : ''}

              <!-- Inspection Actions -->
              <div class="dgo-stack dgo-stack--2" style="border-top:1px solid var(--dgo-color-border-default); padding-top:var(--dgo-s-4); margin-top: var(--dgo-s-2);">
                <button class="dgo-btn dgo-btn--md dgo-btn--outline" id="btn-inspect-flag">
                  <svg style="width:16px; height:16px;"><use href="assets/icons/sprite.svg#i-settings"></use></svg>
                  <span>Flag Operational Status</span>
                </button>
                
                ${doc.status === 'PENDING' ? `
                  <a href="assign.html?documentId=${Sanitizer.escape(doc.id)}" class="dgo-btn dgo-btn--md dgo-btn--primary">
                    <svg style="width:16px; height:16px;"><use href="assets/icons/sprite.svg#i-plus"></use></svg>
                    <span>Route Assignments</span>
                  </a>
                ` : `
                  <button class="dgo-btn dgo-btn--md dgo-btn--disabled" disabled>Routed for Action</button>
                `}
              </div>
            </div>
          `;

          // Bind inspectors actions
          document.getElementById('btn-inspect-flag').addEventListener('click', () => {
            openFlagModal();
          });
        }

        // Handle multi-dossier sticky actions bar
        function updateBulkBanner() {
          const banner = document.getElementById('bulk-banner');
          const countSpan = document.getElementById('bulk-selection-count');
          
          if (checkedIds.size > 0) {
            banner.style.display = 'flex';
            countSpan.textContent = `${checkedIds.size} ${checkedIds.size === 1 ? 'Dossier' : 'Dossiers'} Selected`;
          } else {
            banner.style.display = 'none';
          }
        }

        // Bulk action cancellations
        document.getElementById('btn-bulk-cancel').addEventListener('click', () => {
          checkedIds.clear();
          renderGrid();
          updateBulkBanner();
        });

        // Navigate selected records to the Bulk Assignment form module E07/E08
        document.getElementById('btn-bulk-route').addEventListener('click', () => {
          const ids = Array.from(checkedIds).join(',');
          window.location.href = `bulk-assign.html?ids=${ids}`;
        });

        // Toggle Select All / None
        document.getElementById('btn-select-all').addEventListener('click', () => {
          if (checkedIds.size === documents.length) {
            checkedIds.clear();
          } else {
            documents.forEach(doc => checkedIds.add(doc.id));
          }
          renderGrid();
          updateBulkBanner();
        });

        // Trigger adjustments modal dialog
        const modal = document.getElementById('modal-flag-overlay');

        function openFlagModal() {
          document.getElementById('flag-select-control').value = currentlySelectedDoc.flag || '';
          modal.classList.add('dgo-modal-overlay--active');
          closeTrapFn = window.A11y.trapFocus(modal.querySelector('.dgo-modal'));
        }

        function closeFlagModal() {
          modal.classList.remove('dgo-modal-overlay--active');
          if (closeTrapFn) {
            closeTrapFn();
            closeTrapFn = null;
          }
        }

        document.getElementById('btn-modal-close').addEventListener('click', closeFlagModal);
        document.getElementById('btn-modal-cancel').addEventListener('click', closeFlagModal);

        // Commit active doc flag updates via E03 Power Automate trigger
        document.getElementById('btn-modal-save').addEventListener('click', async () => {
          const newFlag = document.getElementById('flag-select-control').value;
          const user = window.State.getActiveUser();

          try {
            window.Chrome.showToast('Triggering Stream Flag...');
            
            const payload = {
              documentId: currentlySelectedDoc.id,
              flag: newFlag,
              flaggedBy: user.name
            };

            const response = await window.API.callPA('E03', payload);
            if (response.success) {
              window.Chrome.showToast('Flag Commited Successfully!', 'success');
              closeFlagModal();
              
              // Local re-index
              currentlySelectedDoc.flag = newFlag;
              currentlySelectedDoc.flaggedBy = user.name;
              currentlySelectedDoc.flaggedDate = new Date().toISOString();
              
              const storedDocs = window.API.getStoredDocuments();
              const idx = storedDocs.findIndex(d => d.id === currentlySelectedDoc.id);
              if (idx !== -1) {
                storedDocs[idx].flag = newFlag;
                storedDocs[idx].flaggedBy = user.name;
                storedDocs[idx].flaggedDate = currentlySelectedDoc.flaggedDate;
                window.API.saveStoredDocuments(storedDocs);
              }

              // Re-render
              renderGrid();
              selectDossier(currentlySelectedDoc);
            } else {
              window.Chrome.showToast('Operational gate declined flag.', 'error');
            }
          } catch (err) {
            window.Chrome.showToast(err.message, 'error');
          }
        });

        // Listeners for input OData filtration
        document.getElementById('search-input').addEventListener('input', () => {
          fetchAndRender();
        });
        document.getElementById('category-filter').addEventListener('change', () => {
          fetchAndRender();
        });
        document.getElementById('btn-sync-feed').addEventListener('click', () => {
          fetchAndRender();
        });

        // Initialize lists
        await fetchAndRender();
        window.addEventListener('dgo:data-refreshed', fetchAndRender); // in-place re-render
      });
