/* Externalized page logic for assign.html (ARC-02 / SEC-03).
   Moved verbatim from the page's inline <script type="module"> block(s); no behavior
   change — handler functions remain window-attached. Page logic now lives in a real
   module file instead of an inline per-page monolith. */

      document.addEventListener('DOMContentLoaded', async () => {
        window.Chrome.bootstrap('assign');

        const ccTags = new Set();
        let officers = [];
        let categories = [];
        let depts = [];

        // Check query URL params for autostart
        const params = new URLSearchParams(window.location.search);
        const docParam = params.get('documentId');
        if (docParam) {
          document.getElementById('frm-document-id').value = docParam;
          updateLiveSummary();
        }

        // Initialize elements
        try {
          const refs = await window.Lookups.loadReferences();
          officers = refs.officers || [];
          categories = refs.categories || [];
          depts = refs.departments || [];

          // Populates Process Category select
          const selectCat = document.getElementById('frm-category');
          selectCat.innerHTML += categories.map(c => `<option value="${c.code}">${Sanitizer.escape(c.name)}</option>`).join('');

          // Populate CC options
          const selectCC = document.getElementById('select-cc-dept');
          selectCC.innerHTML += depts.map(d => `<option value="${d.code}">${Sanitizer.escape(d.name)} (${d.code})</option>`).join('');

        } catch (err) {
          window.Chrome.showToast('Reference lookups sync failed.', 'error');
        }

        // CC actions tags adder
        document.getElementById('btn-add-cc').addEventListener('click', () => {
          const select = document.getElementById('select-cc-dept');
          const code = select.value;
          if (code && !ccTags.has(code)) {
            ccTags.add(code);
            renderCCTags();
            updateLiveSummary();
            select.selectedIndex = 0;
          }
        });

        function renderCCTags() {
          const container = document.getElementById('cc-tags-container');
          container.innerHTML = Array.from(ccTags).map(code => `
            <span class="dgo-badge dgo-badge--routed dgo-cluster dgo-cluster--density" style="height:26px; padding-right:4px;">
              <span>${code}</span>
              <button type="button" class="btn-cc-remove dgo-centered" data-code="${code}" style="width:16px; height: 16px; border-radius:50%; background:rgba(0,0,0,0.1); color: var(--dgo-color-fg-muted); margin-left:var(--dgo-s-1);">✖</button>
            </span>
          `).join('');

          container.querySelectorAll('.btn-cc-remove').forEach(btn => {
            btn.addEventListener('click', () => {
              const code = btn.getAttribute('data-code');
              ccTags.delete(code);
              renderCCTags();
              updateLiveSummary();
            });
          });
        }

        // Auto-resolver on process cascade choice
        document.getElementById('frm-category').addEventListener('change', (e) => {
          const code = e.target.value;
          const cascade = window.Lookups.resolveCategoryCascade(code);
          if (cascade) {
            // Apply assignments
            document.getElementById('frm-assignee-val').value = cascade.defaultAssigneeId;
            document.getElementById('frm-assignee').value = cascade.defaultAssigneeName;
            document.getElementById('btn-clear-assignee').style.display = 'inline-block';

            // Priority
            document.getElementById('frm-priority').value = cascade.defaultPriority;

            // Timer
            document.getElementById('frm-deadline').value = cascade.deadlineDays;

            // CC Add defaults
            ccTags.clear();
            cascade.defaultCC.forEach(c => ccTags.add(c));
            renderCCTags();

            updateLiveSummary();
            window.Chrome.showToast('Category direct cascade successfully applied!', 'success');
          }
        });

        // Setup autocompletes
        setupAutocompleteInput('frm-assignee', 'suggest-assignee-dropdown', 'frm-assignee-val', 'btn-clear-assignee');
        setupAutocompleteInput('frm-co-assignee', 'suggest-coassignee-dropdown', 'frm-co-assignee-val', 'btn-clear-coassignee');

        function setupAutocompleteInput(inputId, dropdownId, hiddenValId, clearId) {
          const input = document.getElementById(inputId);
          const dropdown = document.getElementById(dropdownId);
          const hidden = document.getElementById(hiddenValId);
          const clear = document.getElementById(clearId);

          input.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
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
                updateLiveSummary();
              });
            });
          });

          // Clear buttons
          if (clear) {
            clear.addEventListener('click', () => {
              input.value = '';
              hidden.value = '';
              clear.style.display = 'none';
              updateLiveSummary();
            });
          }

          // Document click click-away
          document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
              dropdown.style.display = 'none';
            }
          });
        }

        // Key Up events for summary sync
        document.querySelectorAll('.dgo-input, .dgo-textarea, .dgo-select').forEach(el => {
          el.addEventListener('change', updateLiveSummary);
          el.addEventListener('keyup', updateLiveSummary);
        });

        function updateLiveSummary() {
          const docId = document.getElementById('frm-document-id').value;
          document.getElementById('sum-doc-id').textContent = docId || '(Undefined)';

          const cat = document.getElementById('frm-category');
          const catText = cat.selectedIndex > 0 ? cat.options[cat.selectedIndex].text : '(Not Selected)';
          document.getElementById('sum-category').textContent = catText;

          const assigneeName = document.getElementById('frm-assignee').value;
          document.getElementById('sum-assignee').textContent = assigneeName || '(Not Assigned)';

          const helpCo = document.getElementById('frm-co-assignee').value;
          document.getElementById('sum-co-assignee').textContent = helpCo || '(None)';

          const ccList = Array.from(ccTags).join(', ');
          document.getElementById('sum-cc').textContent = ccList || '(None)';

          const prioritySel = document.getElementById('frm-priority').value;
          const pBadge = document.getElementById('sum-priority');
          pBadge.textContent = prioritySel;
          pBadge.className = `dgo-badge dgo-badge--${prioritySel === 'HIGH' ? 'action' : (prioritySel === 'MEDIUM' ? 'routed' : 'draft')}`;

          const deadDays = document.getElementById('frm-deadline').value;
          document.getElementById('sum-deadline').textContent = deadDays ? `${deadDays} Days` : '14 Days';

          const directsText = document.getElementById('frm-directives').value;
          document.getElementById('sum-directives').textContent = directsText || '(Enter standing directives...)';
        }

        // Browse docs selectors modals
        window.openDocBrowser = async () => {
          const docModal = document.getElementById('modal-dossier-selector');
          docModal.classList.add('dgo-modal-overlay--active');
          window.A11y.trapFocus(docModal.querySelector('.dgo-modal'));

          try {
            const data = await window.API.callPA('E02');
            const docs = data?.records || [];
            const tbody = document.getElementById('modal-docs-tbody');

            tbody.innerHTML = docs.filter(d => d.status === 'PENDING').map(d => `
              <tr>
                <td><code style="background: var(--dgo-color-surface-sunken); padding: 2px 6px; border-radius: 4px;">${Sanitizer.escape(d.id)}</code></td>
                <td>
                  <div class="dgo-stack dgo-stack--0">
                    <span style="font-weight: 600; font-size:var(--dgo-type-body-sm);">${Sanitizer.escape(d.title)}</span>
                    <span style="font-size:10px; color: var(--dgo-color-fg-muted);">${Sanitizer.escape(d.sender)}</span>
                  </div>
                </td>
                <td><span style="font-size: var(--dgo-type-body-sm);">${getCategoryLabel(d.category)}</span></td>
                <td style="text-align:right;">
                  <button type="button" class="dgo-btn dgo-btn--sm dgo-btn--primary" data-act="pickDoc" data-arg="${Sanitizer.escape(d.id)}">Select</button>
                </td>
              </tr>
            `).join('');
          } catch {
            window.Chrome.showToast('Reference document loading failed.', 'error');
          }
        };

        window.pickDoc = (id) => {
          document.getElementById('frm-document-id').value = id;
          window.closeDocBrowser();
          updateLiveSummary();
          window.Chrome.showToast(`Dossier ${id} associated loaded!`, 'success');
        };

        window.closeDocBrowser = () => {
          document.getElementById('modal-dossier-selector').classList.remove('dgo-modal-overlay--active');
        };

        document.getElementById('btn-select-doc-modal').addEventListener('click', window.openDocBrowser);

        function getCategoryLabel(code) {
          const cat = categories.find(c => c.code === code);
          return cat ? cat.name : code;
        }

        // Preview actions modal
        const previewModal = document.getElementById('modal-envelope-preview');
        let envelopePayload = null;

        window.openPreviewModal = () => {
          const form = document.getElementById('assignment-form');
          if (!form.reportValidity()) {
            window.Chrome.showToast('Please satisfy form requirements first.', 'warning');
            return;
          }

          previewModal.classList.add('dgo-modal-overlay--active');
          window.A11y.trapFocus(previewModal.querySelector('.dgo-modal'));

          // Load previews fields
          const assigneeName = document.getElementById('frm-assignee').value;
          const directTitle = document.getElementById('frm-title').value;
          const parentDoc = document.getElementById('frm-document-id').value;
          const directsText = document.getElementById('frm-directives').value;
          const priority = document.getElementById('frm-priority').value;
          const lengthDays = document.getElementById('frm-deadline').value;
          const ccList = Array.from(ccTags).join(', ') || 'None';

          document.getElementById('email-preview-assignee').textContent = assigneeName;
          document.getElementById('email-preview-title').textContent = directTitle;
          document.getElementById('email-preview-doc-id').textContent = parentDoc;
          document.getElementById('email-preview-directives').textContent = directsText || 'No Standing directives specified.';
          document.getElementById('email-preview-priority').textContent = priority;
          document.getElementById('email-preview-deadline').textContent = `${lengthDays} Days`;
          document.getElementById('email-preview-cc').textContent = ccList;

          // Assemble JSON envelope
          envelopePayload = {
            documentId: parentDoc,
            title: directTitle,
            category: document.getElementById('frm-category').value,
            assignee: document.getElementById('frm-assignee-val').value || assigneeName,
            coAssignee: document.getElementById('frm-co-assignee-val').value || document.getElementById('frm-co-assignee').value,
            cc: Array.from(ccTags),
            priority: priority,
            deadlineDays: parseInt(lengthDays),
            directives: directsText
          };

          document.getElementById('json-payload-pre').textContent = JSON.stringify(envelopePayload, null, 2);
          switchPreviewTab('email');
        };

        window.closePreviewModal = () => {
          previewModal.classList.remove('dgo-modal-overlay--active');
        };

        // Modal Preview Tabs
        window.switchPreviewTab = (tab) => {
          const emailTab = document.getElementById('preview-tab-email');
          const jsonTab = document.getElementById('preview-tab-json');
          const emailBtn = document.getElementById('tab-btn-email');
          const jsonBtn = document.getElementById('tab-btn-json');

          if (tab === 'email') {
            emailTab.style.display = 'flex';
            jsonTab.style.display = 'none';
            emailBtn.classList.add('dgo-tab--active');
            jsonBtn.classList.remove('dgo-tab--active');
          } else {
            emailTab.style.display = 'none';
            jsonTab.style.display = 'block';
            emailBtn.classList.remove('dgo-tab--active');
            jsonBtn.classList.add('dgo-tab--active');
          }
        };

        document.getElementById('btn-form-preview').addEventListener('click', window.openPreviewModal);

        // Core single assignment trigger E06 Power Automate invoke
        document.getElementById('btn-modal-dispatch').addEventListener('click', async () => {
          if (!envelopePayload) return;

          try {
            window.Chrome.showToast('Routing Directive to Power Automate...');
            const response = await window.API.callPA('E06', envelopePayload);
            
            if (response.success) {
              window.Chrome.showToast('Directive routed and active!', 'success');
              closePreviewModal();
              
              // Clear fields
              document.getElementById('assignment-form').reset();
              ccTags.clear();
              renderCCTags();
              updateLiveSummary();

              // Redirect
              setTimeout(() => {
                window.location.href = 'tasks.html';
              }, 1200);
            } else {
              window.Chrome.showToast('Routing failed. Registry rejected payload.', 'error');
            }
          } catch (err) {
            window.Chrome.showToast(err.message, 'error');
          }
        });

        // Reset forms click
        document.getElementById('btn-reset-form').addEventListener('click', () => {
          document.getElementById('assignment-form').reset();
          ccTags.clear();
          renderCCTags();
          updateLiveSummary();
          window.Chrome.showToast('Form fields cleared.', 'success');
        });
      });
