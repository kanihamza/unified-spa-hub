/* Externalized page logic for registry-movement.html (ARC-02 / SEC-03).
   Moved verbatim from the page's inline <script type="module"> block(s); no behavior
   change — handler functions remain window-attached. Page logic now lives in a real
   module file instead of an inline per-page monolith. */

      document.addEventListener('DOMContentLoaded', async () => {
        // Bootstrap the sidebar as movement section
        window.Chrome.bootstrap('movement');

        let documents = [];
        let officers = [];
        let categories = [];
        let currentFilter = 'ALL';
        let selectedDoc = null;
        
        // Load initial databases
        try {
          const refs = await window.Lookups.loadReferences();
          officers = refs.officers || [];
          categories = refs.categories || [];

          // Populate route to dropdown options
          const dropdown = document.getElementById('frm-minute-route-to');
          dropdown.innerHTML += officers.map(o => `
            <option value="${Sanitizer.escape(o.id)}">${Sanitizer.escape(o.name)} (${Sanitizer.escape(o.role)})</option>
          `).join('');

          await loadGrid();
        } catch(err) {
          window.Chrome.showToast('Reference lookups sync failed.', 'error');
        }

        async function loadGrid() {
          const response = await window.API.callPA('E02');
          documents = response?.records || [];
          renderRegistryList();
        }

        // Handle filtering
        window.setFilter = (filter) => {
          currentFilter = filter;
          document.querySelectorAll('.dgo-tab').forEach(tab => tab.classList.remove('dgo-tab--active'));
          
          if (filter === 'ALL') document.getElementById('tab-all').classList.add('dgo-tab--active');
          if (filter === 'PENDING') document.getElementById('tab-pending').classList.add('dgo-tab--active');
          if (filter === 'ROUTED') document.getElementById('tab-routed').classList.add('dgo-tab--active');

          renderRegistryList();
        };

        function renderRegistryList() {
          const listDiv = document.getElementById('file-registry-list');
          let filtered = [...documents];
          
          if (currentFilter === 'PENDING') {
            filtered = filtered.filter(d => d.status === 'PENDING');
          } else if (currentFilter === 'ROUTED') {
            filtered = filtered.filter(d => d.status === 'ROUTED');
          }

          if (filtered.length === 0) {
            listDiv.innerHTML = `<div style="text-align: center; color: var(--dgo-color-fg-subtle); padding: var(--dgo-s-4);">No dossiers match filters.</div>`;
            return;
          }

          listDiv.innerHTML = filtered.map(doc => {
            const isSelected = selectedDoc && selectedDoc.id === doc.id;
            const style = isSelected ? 'background: var(--dgo-green-50); border-color: var(--dgo-color-border-brand);' : '';
            return `
              <div class="dgo-card dgo-card--interactive dgo-stack dgo-stack--1" 
                   style="${style} padding: var(--dgo-s-3); border-radius: var(--dgo-radius-control);"
                   data-act="selectFile" data-arg="${Sanitizer.escape(doc.id)}">
                <div class="dgo-cluster dgo-cluster--between">
                  <code style="font-size:11px; font-weight:700; background: var(--dgo-color-surface-sunken); padding: 1px 4px; border-radius:3px;">${Sanitizer.escape(doc.id)}</code>
                  <span class="dgo-badge dgo-badge--${doc.status === 'ROUTED' ? 'routed' : 'pending'}" style="font-size: 9px; padding-inline: 4px;">${Sanitizer.escape(doc.status)}</span>
                </div>
                <strong style="font-size: 12px; color: var(--dgo-color-fg-strong); line-height:1.3;" class="text-clamp-2">${Sanitizer.escape(doc.title)}</strong>
                <span style="font-size: 10px; color: var(--dgo-color-fg-muted);">Location: ${getLocationLabel(doc.assignedTo)}</span>
              </div>
            `;
          }).join('');
        }

        function getLocationLabel(assignedTo) {
          if (!assignedTo) return 'Central Registry Mailroom';
          const off = officers.find(o => o.id === assignedTo);
          return off ? off.name : 'Joint Committee Unit';
        }

        // Minute movements Local Persistence helper
        function getMovementsStore(docId) {
          const raw = localStorage.getItem(`dgo_move_log_${docId}`);
          // A dossier with no recorded movement starts with an empty minute sheet
          // (no sample/seed data); users add minutes live via the minute editor.
          if (!raw) return { log: [], minutes: [] };
          try { return JSON.parse(raw); } catch { return { log: [], minutes: [] }; }
        }

        function saveMovementsStore(docId, state) {
          localStorage.setItem(`dgo_move_log_${docId}`, JSON.stringify(state));
        }

        window.selectFile = (docId) => {
          const doc = documents.find(d => d.id === docId);
          if (!doc) return;

          selectedDoc = doc;
          renderRegistryList();

          const activeState = getMovementsStore(docId);
          renderMinuteSheet(activeState.minutes, doc);
          renderMovementTimeline(activeState.log);

          // Display New Minute sheet formulation panel
          document.getElementById('minute-editor-card').style.display = 'block';
        };

        function renderMinuteSheet(minutes, doc) {
          const viewport = document.getElementById('minute-sheet-viewport');
          
          let headHtml = `
            <div style="border-bottom: 2px solid var(--dgo-color-border-brand); padding-bottom:Var(--dgo-s-3); margin-bottom:var(--dgo-s-4);">
              <span class="dgo-overline" style="color:var(--dgo-color-action-accent);">Registry Official Minute Sheet</span>
              <h3 class="dgo-h4" style="font-family: var(--dgo-family-mono); font-weight:700;">SUBJECT: ${Sanitizer.escape(doc.title)}</h3>
              <div class="dgo-cluster dgo-cluster--between" style="font-size: 11px; font-family:var(--dgo-family-mono); color: var(--dgo-color-fg-muted); margin-top:4px;">
                <span>File Reference Number: ${Sanitizer.escape(doc.id)}</span>
                <span>Created: ${new Date(doc.dateReceived).toLocaleString()}</span>
              </div>
            </div>
          `;

          let bodyHtml = minutes.map(min => {
            const officer = officers.find(o => o.id === min.officerId);
            return `
              <div class="dgo-minute-block">
                <div class="dgo-minute-header">${Sanitizer.escape(min.num)} &mdash; ${getActionBadge(min.action)}</div>
                <div class="dgo-minute-body">${Sanitizer.escape(min.text)}</div>
                <div class="dgo-minute-signature">
                  <span class="sig-name">${Sanitizer.escape(officer ? officer.name : min.officerId)}</span>
                  <span class="sig-role">${Sanitizer.escape(officer ? officer.role : 'Authorized official Representative')}</span>
                  <span style="font-family: var(--dgo-family-mono); font-size:10px;">${new Date(min.timestamp).toLocaleString()}</span>
                </div>
              </div>
            `;
          }).join('');

          viewport.innerHTML = headHtml + `<div class="dgo-stack dgo-stack--4" style="margin-top:20px;">${bodyHtml}</div>`;
        }

        function getActionBadge(act) {
          if (act === 'FOR_ATTENTION') return `<span style="background:var(--dgo-green-100); color:var(--dgo-green-900); padding:1px 6px; font-size:8px; border-radius:3px;">FOR ATTENTION</span>`;
          if (act === 'FOR_REVIEW') return `<span style="background:var(--dgo-blue-100); color:var(--dgo-blue-900); padding:1px 6px; font-size:8px; border-radius:3px;">FOR REVIEW</span>`;
          return `<span style="background:rgba(0,0,0,0.06); color:var(--dgo-color-fg-muted); padding:1px 6px; font-size:8px; border-radius:3px;">FOR ACTION</span>`;
        }

        function renderMovementTimeline(logs) {
          const viewport = document.getElementById('movement-timeline-viewport');
          
          let logHtml = logs.map((log, idx) => {
            const isActive = idx === logs.length - 1;
            const stateClass = isActive ? 'dgo-movement-item--active' : '';
            return `
              <div class="dgo-movement-item ${stateClass}">
                <div class="dgo-movement-marker"></div>
                <div class="dgo-movement-meta">${new Date(log.time).toLocaleString()}</div>
                <div class="dgo-movement-desc">${Sanitizer.escape(log.action)}</div>
                <div style="font-size:11px; color:var(--dgo-color-fg-muted); margin-top:2px;">
                  From: ${Sanitizer.escape(log.from)} &rarr; To: ${log.to}
                </div>
              </div>
            `;
          }).reverse().join(''); // Show latest on top of track logs

          viewport.innerHTML = `<div class="dgo-stack dgo-stack--3">${logHtml}</div>`;
        }

        // Handle form entry dispatch
        document.getElementById('new-minute-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!selectedDoc) return;

          const text = document.getElementById('frm-minute-content').value;
          const routeTo = document.getElementById('frm-minute-route-to').value;
          const actionClass = document.getElementById('frm-minute-action').value;

          const activeUser = window.State.getActiveUser();
          const routeToOfficer = officers.find(o => o.id === routeTo);

          if (!text || !routeTo) {
            window.Chrome.showToast('Please fulfill all required fields.', 'warning');
            return;
          }

          try {
            window.Chrome.showToast('Registering minute & dispatching dossier...');
            
            // 1. Update database documents status to routed
            const dbDocs = window.API.getStoredDocuments();
            const dIdx = dbDocs.findIndex(d => d.id === selectedDoc.id);
            if (dIdx !== -1) {
              dbDocs[dIdx].status = 'ROUTED';
              dbDocs[dIdx].assignedTo = routeTo;
              window.API.saveStoredDocuments(dbDocs);
              selectedDoc.status = 'ROUTED';
              selectedDoc.assignedTo = routeTo;
            }

            // 2. Add New Minute & timeline log
            const activeState = getMovementsStore(selectedDoc.id);
            const minuteId = activeState.minutes.length + 1;
            
            const newMin = {
              id: minuteId,
              num: `MINUTE ${minuteId}`,
              text: text,
              officerId: activeUser.id === 'DEV_USER' ? 'O02' : 'O01', // Conforms to active roles
              action: actionClass,
              timestamp: new Date().toISOString()
            };

            const newLog = {
              time: new Date().toISOString(),
              from: activeUser.name,
              to: routeToOfficer ? routeToOfficer.name : 'Target Division unit',
              action: `Minute ${minuteId} Appended: File Routed`
            };

            activeState.minutes.push(newMin);
            activeState.log.push(newLog);
            saveMovementsStore(selectedDoc.id, activeState);

            // Clear inputs
            document.getElementById('frm-minute-content').value = '';
            document.getElementById('frm-minute-route-to').selectedIndex = 0;

            // Re-sync and refresh layout
            window.Chrome.showToast('Minute generated. Dossier re-routed!', 'success');
            await loadGrid();
            
            // Re-select loaded state
            selectFile(selectedDoc.id);

          } catch(err) {
            window.Chrome.showToast('Failed to commit minute transaction.', 'error');
          }
        });

        // In-place re-render on global refresh
        window.addEventListener('dgo:data-refreshed', () => { loadGrid(); }); // in-place re-render

      });
