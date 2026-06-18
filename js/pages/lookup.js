/* Externalized page logic for lookup.html (ARC-02 / SEC-03).
   Moved verbatim from the page's inline <script type="module"> block(s); no behavior
   change — handler functions remain window-attached. Page logic now lives in a real
   module file instead of an inline per-page monolith. */

      document.addEventListener('DOMContentLoaded', async () => {
        window.Chrome.bootstrap('lookup');

        let lookupsDatabase = {
          docs: [],
          tasks: [],
          emails: []
        };
        let matchingList = [];
        let officers = [];
        let categories = [];
        let selectedRecord = null;
        let activeLookupType = 'DOC';

        // Load databases
        try {
          const refs = await window.Lookups.loadReferences();
          officers = refs.officers || [];
          categories = refs.categories || [];
          
          await loadFreshData();
        } catch(err) {
          window.Chrome.showToast('Failed to coordinate lookup registries.', 'error');
        }

        async function loadFreshData() {
          const dResp = await window.API.callPA('E02', {});
          const tResp = await window.API.callPA('E04', {});
          const eResp = await window.API.callPA('E09', {});

          lookupsDatabase.docs = dResp?.records || [];
          lookupsDatabase.tasks = tResp?.records || [];
          lookupsDatabase.emails = eResp?.records || [];
        }

        // Execute search on type & query
        window.triggerLookupSearch = () => {
          const type = document.getElementById('lookup-type').value;
          const query = document.getElementById('lookup-query').value.trim().toLowerCase();
          
          activeLookupType = type;
          let pool = [];
          if (type === 'DOC') pool = lookupsDatabase.docs;
          if (type === 'TSK') pool = lookupsDatabase.tasks;
          if (type === 'EML') pool = lookupsDatabase.emails;

          if (!query) {
            matchingList = [...pool];
          } else {
            matchingList = pool.filter(it => {
              if (type === 'DOC') {
                return it.id.toLowerCase().includes(query) || 
                       it.title.toLowerCase().includes(query) || 
                       it.sender.toLowerCase().includes(query);
              } else if (type === 'TSK') {
                return it.id.toLowerCase().includes(query) || 
                       it.title.toLowerCase().includes(query) || 
                       it.directives.toLowerCase().includes(query);
              } else {
                return it.id.toLowerCase().includes(query) || 
                       it.subject.toLowerCase().includes(query) || 
                       it.sender.toLowerCase().includes(query) || 
                       it.body.toLowerCase().includes(query);
              }
            });
          }

          document.getElementById('results-count-badge').textContent = matchingList.length;
          renderResultsIndex();
        };

        document.getElementById('btn-execute-lookup').addEventListener('click', window.triggerLookupSearch);
        document.getElementById('lookup-query').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') window.triggerLookupSearch();
        });

        function renderResultsIndex() {
          const divList = document.getElementById('lookup-results-index-viewport');
          if (matchingList.length === 0) {
            divList.innerHTML = `<div style="text-align:center; color:var(--dgo-color-fg-subtle); padding:var(--dgo-s-4);">No register index record matched query.</div>`;
            return;
          }

          divList.innerHTML = matchingList.map(rec => {
            const isSel = selectedRecord && selectedRecord.id === rec.id;
            const style = isSel ? 'background: var(--dgo-green-50); border-color: var(--dgo-color-border-brand);' : '';
            const titleText = Sanitizer.escape(activeLookupType === 'DOC' ? rec.title : (activeLookupType === 'TSK' ? rec.title : rec.subject));
            const secondary = activeLookupType === 'DOC' ? Sanitizer.escape(rec.sender) : (activeLookupType === 'TSK' ? `Owner ID: ${Sanitizer.escape(rec.assignee)}` : Sanitizer.escape(rec.sender));

            return `
              <div class="dgo-card dgo-card--interactive dgo-stack dgo-stack--1" 
                   style="${style} padding: var(--dgo-s-3); border-radius: var(--dgo-r-lg);"
                   data-act="selectLookupRecord" data-arg="${Sanitizer.escape(rec.id)}">
                <div class="dgo-cluster dgo-cluster--between">
                  <code style="font-size:11px; background:var(--dgo-color-surface-sunken); padding:2px 4px; border-radius:3px; font-weight:700;">${Sanitizer.escape(rec.id)}</code>
                  <span class="dgo-badge dgo-badge--outline" style="font-size: 9px; padding-inline:4px;">${activeLookupType}</span>
                </div>
                <strong style="font-size:12px; color:var(--dgo-color-fg-strong); line-height:1.3;" class="text-clamp-2">${titleText}</strong>
                <span style="font-size:10px; color:var(--dgo-color-fg-muted);">${secondary}</span>
              </div>
            `;
          }).join('');
        }

        window.selectLookupRecord = (id) => {
          let pool = [];
          if (activeLookupType === 'DOC') pool = lookupsDatabase.docs;
          if (activeLookupType === 'TSK') pool = lookupsDatabase.tasks;
          if (activeLookupType === 'EML') pool = lookupsDatabase.emails;

          selectedRecord = pool.find(it => it.id === id);
          renderResultsIndex();

          if (selectedRecord) {
            renderWorkbenchConsole();
          }
        };

        function renderWorkbenchConsole() {
          const bench = document.getElementById('lookup-workbench-viewport');
          if (activeLookupType === 'DOC') {
            const rec = selectedRecord;
            const flagMarkup = rec.flag ? `
              <span class="dgo-badge dgo-badge--escalated" style="font-family: var(--dgo-family-mono); font-weight:700;">FLAGGED: ${rec.flag}</span>
            ` : `<span style="font-size:11px; color:var(--dgo-color-fg-muted); font-style:italic;">No compliance flags active.</span>`;

            bench.innerHTML = `
              <div class="dgo-stack dgo-stack--4">
                <div class="dgo-cluster dgo-cluster--between" style="border-bottom:1px solid var(--dgo-color-border-default); padding-bottom:var(--dgo-s-2);">
                  <div class="dgo-stack dgo-stack--0">
                    <span class="dgo-overline">Dossier Correspondence Registry</span>
                    <h3 class="dgo-h4" style="font-family:var(--dgo-family-mono); font-weight:700;">${Sanitizer.escape(rec.id)}</h3>
                  </div>
                  <span class="dgo-badge dgo-badge--${rec.status === 'ROUTED' ? 'routed' : 'pending'}">${Sanitizer.escape(rec.status)}</span>
                </div>

                <div class="dgo-stack dgo-stack--1">
                  <span class="dgo-overline">Dossier / Movement Subject</span>
                  <p class="dgo-body-sm text-strong" style="font-size:14px;">${Sanitizer.escape(rec.title)}</p>
                </div>

                <div class="dgo-grid dgo-grid--2" style="font-size: var(--dgo-type-body-sm); gap: var(--dgo-s-3);">
                  <div class="dgo-stack dgo-stack--1">
                    <span class="dgo-overline">Origin Dispatch Sender</span>
                    <span class="text-strong">${Sanitizer.escape(rec.sender)}</span>
                  </div>
                  <div class="dgo-stack dgo-stack--1">
                    <span class="dgo-overline">Flag Compliance Tracker</span>
                    <div>${flagMarkup}</div>
                  </div>
                </div>

                <!-- Primary Document Actions Segment -->
                <div class="dgo-cluster dgo-cluster--density" style="border-top: 1px solid var(--dgo-color-border-default); padding-top: var(--dgo-s-4); gap: var(--dgo-s-3);">
                  <button class="dgo-btn dgo-btn--md dgo-btn--outline" data-act="openFlagModal">
                    <svg style="width:16px; height:16px;"><use href="assets/icons/sprite.svg#i-settings"></use></svg>
                    <span>Fulfill / Adjust Flag</span>
                  </button>
                  <button class="dgo-btn dgo-btn--md dgo-btn--primary" data-act="toggleRouteForm">
                    <svg style="width:16px; height:16px;"><use href="assets/icons/sprite.svg#i-plus"></use></svg>
                    <span>Route Sub-Assignment (E06)</span>
                  </button>
                </div>

                <!-- Hidden form drawer for direct cascading assignment -->
                <div id="embed-assign-form-drawer" class="dgo-card dgo-stack dgo-stack--3 dgo-card--sunken" style="display:none; border-left:3px solid var(--dgo-color-action-primary);">
                  <h4 style="font-weight:700; font-size:13px; text-transform:uppercase; color:var(--dgo-color-action-primary); border-bottom:1px solid var(--dgo-color-border-strong); padding-bottom: 4px;">Assign Task Directives</h4>
                  
                  <form id="frm-embed-assign" class="dgo-stack dgo-stack--3" data-nosubmit>
                    <div class="dgo-form-group">
                      <label for="frm-emb-title" class="dgo-label dgo-label--required">Assignment Task Title</label>
                      <input type="text" id="frm-emb-title" class="dgo-input" required>
                    </div>

                    <div class="dgo-form-group">
                      <label for="frm-emb-category" class="dgo-label dgo-label--required">Cascade Framework Class Category</label>
                      <select id="frm-emb-category" class="dgo-select" required>
                        <option value="" disabled selected>(Select structural class)</option>
                        ${categories.map(c => `<option value="${c.code}">${Sanitizer.escape(c.name)}</option>`).join('')}
                      </select>
                    </div>

                    <div class="dgo-form-group">
                      <label for="frm-emb-assignee" class="dgo-label dgo-label--required">Task Executive Assignee</label>
                      <select id="frm-emb-assignee" class="dgo-select" required>
                        <option value="" disabled selected>(Select target official profile)</option>
                        ${officers.map(o => `<option value="${Sanitizer.escape(o.id)}">${Sanitizer.escape(o.name)} (${Sanitizer.escape(o.role)})</option>`).join('')}
                      </select>
                    </div>

                    <div class="dgo-form-group">
                      <label for="frm-emb-directives" class="dgo-label dgo-label--required">Standing Executive Directives</label>
                      <textarea id="frm-emb-directives" class="dgo-textarea" rows="3" placeholder="Define guidelines, execution parameters..." required></textarea>
                    </div>

                    <button type="submit" class="dgo-btn dgo-btn--md dgo-btn--accent" id="btn-submit-emb-assign">Dispatch Assignment</button>
                  </form>
                </div>

              </div>
            `;
          } else if (activeLookupType === 'TSK') {
            const rec = selectedRecord;
            const primaryOfficer = officers.find(o => o.id === rec.assignee);
            bench.innerHTML = `
              <div class="dgo-stack dgo-stack--4">
                <div class="dgo-cluster dgo-cluster--between" style="border-bottom:1px solid var(--dgo-color-border-default); padding-bottom:var(--dgo-s-2);">
                  <div class="dgo-stack dgo-stack--0">
                    <span class="dgo-overline">Action Assignment Plan</span>
                    <h3 class="dgo-h4" style="font-family:var(--dgo-family-mono); font-weight:700;">${Sanitizer.escape(rec.id)}</h3>
                  </div>
                  <span class="dgo-badge dgo-badge--${rec.status === 'COMPLETED' ? 'replied' : (rec.status === 'ROUTED' ? 'routed' : 'pending')}">${Sanitizer.escape(rec.status)}</span>
                </div>

                <div class="dgo-stack dgo-stack--1">
                  <span class="dgo-overline">Directive Title</span>
                  <p class="dgo-body-sm text-strong" style="font-size:14px;">${Sanitizer.escape(rec.title)}</p>
                </div>

                <div class="dgo-grid dgo-grid--2" style="font-size: var(--dgo-type-body-sm); gap: var(--dgo-s-3);">
                  <div class="dgo-stack dgo-stack--1">
                    <span class="dgo-overline">Responsible Lead Executor</span>
                    <span class="text-strong">${Sanitizer.escape(primaryOfficer ? primaryOfficer.name : rec.assignee)}</span>
                  </div>
                  <div class="dgo-stack dgo-stack--1">
                    <span class="dgo-overline">Priority Tier Rating</span>
                    <span class="dgo-badge dgo-badge--${rec.priority === 'HIGH' ? 'action' : 'draft'}" style="width:fit-content; height:20px; font-size:9px;">${Sanitizer.escape(rec.priority)}</span>
                  </div>
                </div>

                <div class="dgo-stack dgo-stack--1" style="background:var(--dgo-color-surface-sunken); padding:var(--dgo-s-3); border-radius: var(--dgo-radius-control); border-left: 3px solid var(--dgo-color-border-brand);">
                  <span class="dgo-overline">Directives text</span>
                  <p class="dgo-body-sm" style="font-style:italic; line-height:1.4;">"${Sanitizer.escape(rec.directives || 'None configured.')}"</p>
                </div>

                <div class="dgo-stack dgo-stack--1" style="border-top:1px dashed var(--dgo-color-border-default); padding-top:var(--dgo-s-3);">
                  <span class="dgo-overline">Milestone tracker meter</span>
                  <div class="dgo-cluster dgo-cluster--density" style="flex-wrap:nowrap;">
                    <span style="font-family:var(--dgo-family-mono); font-weight:700; width:45px;">${rec.progress}%</span>
                    <div style="flex:1; height:8px; background:var(--dgo-color-border-default); border-radius:10px; overflow:hidden;">
                      <div style="width:${Sanitizer.clampPercent(rec.progress)}%; height:100%; background:var(--dgo-color-action-accent); border-radius:inherit;"></div>
                    </div>
                  </div>
                </div>

                <div style="border-top: 1px solid var(--dgo-color-border-default); padding-top: var(--dgo-s-4);">
                  <button class="dgo-btn dgo-btn--md dgo-btn--accent" data-act="openProgressModal">
                    <svg style="width:16px; height:16px;"><use href="assets/icons/sprite.svg#i-check-circle"></use></svg>
                    <span>Update Task Comments &amp; Progress (E05)</span>
                  </button>
                </div>
              </div>
            `;
          } else if (activeLookupType === 'EML') {
            const rec = selectedRecord;
            bench.innerHTML = `
              <div class="dgo-stack dgo-stack--4">
                <div class="dgo-cluster dgo-cluster--between" style="border-bottom:1px solid var(--dgo-color-border-default); padding-bottom:var(--dgo-s-2);">
                  <div class="dgo-stack dgo-stack--0">
                    <span class="dgo-overline">Core Sync Inbox Mail</span>
                    <h3 class="dgo-h4" style="font-family:var(--dgo-family-mono); font-weight:700;">${Sanitizer.escape(rec.id)}</h3>
                  </div>
                  <span class="dgo-badge dgo-badge--${rec.assignmentStatus === 'ASSIGNED' ? 'replied' : 'pending'}">${rec.assignmentStatus}</span>
                </div>

                <div class="dgo-grid dgo-grid--2" style="font-size: var(--dgo-type-body-sm); gap: var(--dgo-s-3);">
                  <div class="dgo-stack dgo-stack--1">
                    <span class="dgo-overline">Sender Address</span>
                    <span class="text-strong">${Sanitizer.escape(rec.sender)}</span>
                  </div>
                  <div class="dgo-stack dgo-stack--1">
                    <span class="dgo-overline">Date Inbound Synchronized</span>
                    <span>${new Date(rec.dateReceived).toLocaleString()}</span>
                  </div>
                </div>

                <div class="dgo-stack dgo-stack--1">
                  <span class="dgo-overline">Mail Head Subject</span>
                  <p class="dgo-body-sm text-strong" style="font-size:14px;">${Sanitizer.escape(rec.subject)}</p>
                </div>

                <div class="dgo-stack dgo-stack--1" style="background:#fffdfd; border:1px solid var(--dgo-color-border-strong); padding:var(--dgo-s-4); border-radius:var(--dgo-r-md); max-height:180px; overflow-y:auto; line-height:1.5; font-size:13px; color:var(--dgo-color-fg-default);">
                  ${Sanitizer.escape(rec.body)}
                </div>

                <div style="border-top: 1px solid var(--dgo-color-border-default); padding-top: var(--dgo-s-4);">
                  <button class="dgo-btn dgo-btn--md dgo-btn--primary" data-act="toggleEmailTaskForm">
                    <svg style="width:16px; height:16px;"><use href="assets/icons/sprite.svg#i-plus"></use></svg>
                    <span>Extract Assignment Task Directives (E10)</span>
                  </button>
                </div>

                <!-- Hidden form drawer for direct cascading email conversion -->
                <div id="embed-email-form-drawer" class="dgo-card dgo-stack dgo-stack--3 dgo-card--sunken" style="display:none; border-left:3px solid var(--dgo-color-action-accent);">
                  <h4 style="font-weight:700; font-size:13px; text-transform:uppercase; color:var(--dgo-color-action-accent); border-bottom:1px solid var(--dgo-color-border-strong); padding-bottom: 4px;">Convert Email to Task Directives</h4>
                  
                  <form id="frm-embed-email" class="dgo-stack dgo-stack--3" data-nosubmit>
                    <div class="dgo-form-group">
                      <label for="frm-eml-title" class="dgo-label dgo-label--required">Conversion Task Title</label>
                      <input type="text" id="frm-eml-title" class="dgo-input" required>
                    </div>

                    <div class="dgo-form-group">
                      <label for="frm-eml-assignee" class="dgo-label dgo-label--required">Target Executor Principal</label>
                      <select id="frm-eml-assignee" class="dgo-select" required>
                        <option value="" disabled selected>(Select target official profile)</option>
                        ${officers.map(o => `<option value="${Sanitizer.escape(o.id)}">${Sanitizer.escape(o.name)} (${Sanitizer.escape(o.role)})</option>`).join('')}
                      </select>
                    </div>

                    <div class="dgo-form-group">
                      <label for="frm-eml-directives" class="dgo-label dgo-label--required">Standing Directives Commentary</label>
                      <textarea id="frm-eml-directives" class="dgo-textarea" rows="3" placeholder="Core executive directives parsed from incoming email text..." required></textarea>
                    </div>

                    <button type="submit" class="dgo-btn dgo-btn--md dgo-btn--accent" id="btn-submit-eml-assign">Dispatch Conversion (E10)</button>
                  </form>
                </div>
              </div>
            `;
          }
        }

        // Toggles embed drawer forms
        window.toggleRouteForm = () => {
          const div = document.getElementById('embed-assign-form-drawer');
          if (div) {
            const isDis = div.style.display === 'block';
            div.style.display = isDis ? 'none' : 'block';
            
            if (!isDis) {
              // Populate defaults in embeddings
              document.getElementById('frm-emb-title').value = `Action directives: ${selectedRecord.title}`;
              document.getElementById('frm-emb-directives').value = `Please review correspondence ${selectedRecord.id} and submit advice reports directly to the coordinator.`;
              
              // Bind submit
              document.getElementById('frm-embed-assign').addEventListener('submit', window.commitEmbedAssignment);
            }
          }
        };

        window.toggleEmailTaskForm = () => {
          const div = document.getElementById('embed-email-form-drawer');
          if (div) {
            const isDis = div.style.display === 'block';
            div.style.display = isDis ? 'none' : 'block';
            
            if (!isDis) {
              // Populate defaults in embeddings
              document.getElementById('frm-eml-title').value = `E-Mail Directive: ${selectedRecord.subject}`;
              document.getElementById('frm-eml-directives').value = `Follow up with corresponding stakeholders. Origin body: "${selectedRecord.body.slice(0, 100)}..."`;
              
              // Bind submit
              document.getElementById('frm-embed-email').addEventListener('submit', window.commitEmbedEmailToTask);
            }
          }
        };

        // Modal rules triggers
        const fModal = document.getElementById('modal-flag-overlay');
        window.openFlagModal = () => {
          document.getElementById('frm-flag-select').value = selectedRecord.flag || '';
          fModal.classList.add('dgo-modal-overlay--active');
        };
        window.closeFlagModal = () => {
          fModal.classList.remove('dgo-modal-overlay--active');
        };

        document.getElementById('btn-commit-flag').addEventListener('click', async () => {
          const flag = document.getElementById('frm-flag-select').value;
          try {
            window.Chrome.showToast('Flagging document status (E03)...');
            const response = await window.API.callPA('E03', { documentId: selectedRecord.id, flag });
            if (response.success) {
              window.Chrome.showToast('Compliance flag updated!', 'success');
              closeFlagModal();
              await loadFreshData();
              selectLookupRecord(selectedRecord.id);
            }
          } catch(err) {
            window.Chrome.showToast('Fails flag synchronization rule.', 'error');
          }
        });

        // Task milestone modal helpers
        const pModal = document.getElementById('modal-task-update-overlay');
        const rng = document.getElementById('frm-prog-range');
        const num = document.getElementById('frm-prog-num');
        
        rng.addEventListener('input', (e) => num.value = e.target.value);
        num.addEventListener('input', (e) => rng.value = e.target.value);

        window.openProgressModal = () => {
          rng.value = selectedRecord.progress;
          num.value = selectedRecord.progress;
          document.getElementById('frm-status-select').value = selectedRecord.status;
          document.getElementById('frm-notes-comments').value = selectedRecord.lastUpdateNotes || '';
          pModal.classList.add('dgo-modal-overlay--active');
        };
        window.closeProgressModal = () => {
          pModal.classList.remove('dgo-modal-overlay--active');
        };

        document.getElementById('btn-commit-task-update').addEventListener('click', async () => {
          const progress = parseInt(num.value);
          const status = document.getElementById('frm-status-select').value;
          const notes = document.getElementById('frm-notes-comments').value;

          if (!notes) {
            window.Chrome.showToast('Provide operational notes commentary.', 'warning');
            return;
          }

          try {
            window.Chrome.showToast('Broadcasting task progress update (E05)...');
            const response = await window.API.callPA('E05', { taskId: selectedRecord.id, progress, status, notes });
            if (response.success) {
              window.Chrome.showToast('Milestone tracker updated successfully!', 'success');
              closeProgressModal();
              await loadFreshData();
              selectLookupRecord(selectedRecord.id);
            }
          } catch(err) {
            window.Chrome.showToast(err.message, 'error');
          }
        });

        // Embed submission transactions E06 & E10
        window.commitEmbedAssignment = async () => {
          const title = document.getElementById('frm-emb-title').value;
          const category = document.getElementById('frm-emb-category').value;
          const assignee = document.getElementById('frm-emb-assignee').value;
          const directives = document.getElementById('frm-emb-directives').value;

          try {
            window.Chrome.showToast('Dispatching task directives E06...');
            const response = await window.API.callPA('E06', {
              documentId: selectedRecord.id,
              title,
              category,
              assignee,
              directives
            });

            if (response.success) {
              window.Chrome.showToast(`Task ${response.taskId} dispatched successfully!`, 'success');
              await loadFreshData();
              selectLookupRecord(selectedRecord.id);
            }
          } catch(err) {
            window.Chrome.showToast('Failed to dispatch embed directives.', 'error');
          }
        };

        window.commitEmbedEmailToTask = async () => {
          const title = document.getElementById('frm-eml-title').value;
          const assignee = document.getElementById('frm-eml-assignee').value;
          const directives = document.getElementById('frm-eml-directives').value;

          try {
            window.Chrome.showToast('Converting synced email to task E10...');
            const response = await window.API.callPA('E10', {
              emailId: selectedRecord.id,
              title,
              assignee,
              directives
            });

            if (response.success) {
              window.Chrome.showToast('Email task generated!', 'success');
              await loadFreshData();
              selectLookupRecord(selectedRecord.id);
            }
          } catch(err) {
            window.Chrome.showToast('Fails synchronized email conversion.', 'error');
          }
        };

        // In-place re-render on global refresh (data already updated in cache)
        window.addEventListener('dgo:data-refreshed', async () => {
          await loadFreshData();
          if (window.triggerLookupSearch) window.triggerLookupSearch();
        });

      });
