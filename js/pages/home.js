/* Externalized page logic for index.html (ARC-02 / SEC-03).
   Moved verbatim from the page's inline <script type="module"> block(s); no behavior
   change — handler functions remain window-attached. Page logic now lives in a real
   module file instead of an inline per-page monolith. */

      document.addEventListener('DOMContentLoaded', async () => {
        // Initialize layout chrome
        window.Chrome.bootstrap('home');

        // Update system real-time clock indicator (UTC offset notation)
        const clockBadge = document.getElementById('system-time-badge');
        function updateClock() {
          const now = new Date();
          clockBadge.textContent = `${now.toISOString().replace('T',' ').substring(0,19)} UTC`;
        }
        updateClock();
        setInterval(updateClock, 1000);

        async function loadHome() {
        try {
          // Fire E01 references pre-load
          await window.Lookups.loadReferences();

          // Sync incoming docs E02
          const docData = await window.API.callPA('E02', {});
          const documents = docData?.records || [];

          // Sync pending tasks E04
          const taskData = await window.API.callPA('E04', {});
          const tasks = taskData?.records || [];

          // Sync direct inbox E09
          const mailResponse = await window.API.callPA('E09');
          const emails = mailResponse?.records || [];

          // Sync diagnostics telemetry counters
          const diagStats = window.Telemetry.getSummary();

          // Update KPIs
          document.getElementById('kpi-docs-count').textContent = documents.length;
          document.getElementById('kpi-tasks-count').textContent = tasks.filter(t => String(t.status).toUpperCase() === 'PENDING').length;
          document.getElementById('kpi-emails-count').textContent = emails.filter(e => String(e.assignmentStatus).toUpperCase() === 'PENDING').length;
          document.getElementById('kpi-logs-count').textContent = diagStats.totalActions;

          // Render Recent Incoming docs (top 4)
          const homeDocsBody = document.getElementById('home-docs-tbody');
          if (documents.length === 0) {
            homeDocsBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--dgo-color-fg-subtle);">No active dossiers.</td></tr>`;
          } else {
            homeDocsBody.innerHTML = documents.slice(0, 4).map(doc => `
              <tr>
                <td><code style="background: var(--dgo-color-surface-sunken); padding: 2px 6px; border-radius: 4px;">${Sanitizer.escape(doc.id)}</code></td>
                <td>
                  <div class="dgo-stack dgo-stack--0">
                    <span style="font-weight: 600; font-size:var(--dgo-type-body-sm);">${Sanitizer.escape(doc.title)}</span>
                    <span style="font-size:10px; color: var(--dgo-color-fg-muted);">${Sanitizer.escape(doc.sender)}</span>
                  </div>
                </td>
                <td>
                  <span class="dgo-badge dgo-badge--${Sanitizer.escape(String(doc.status).toLowerCase())}">${Sanitizer.escape(doc.status)}</span>
                </td>
              </tr>
            `).join('');
          }

          // Render operational tasks (top 4)
          const homeTasksBody = document.getElementById('home-tasks-tbody');
          if (tasks.length === 0) {
            homeTasksBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--dgo-color-fg-subtle);">No action items registered.</td></tr>`;
          } else {
            homeTasksBody.innerHTML = tasks.slice(0, 4).map(t => {
              const officers = window.Lookups.getOfficers();
              const officer = officers.find(o => o.id === t.assignee);
              return `
                <tr>
                  <td><code style="background: var(--dgo-color-surface-sunken); padding: 2px 6px; border-radius: 4px;">${Sanitizer.escape(t.id)}</code></td>
                  <td>
                    <div class="dgo-stack dgo-stack--0">
                      <span style="font-weight: 600; font-size:var(--dgo-type-body-sm);">${Sanitizer.escape(t.title)}</span>
                      <span style="font-size:10px; color: var(--dgo-color-fg-muted);">Owner: ${Sanitizer.escape(officer ? officer.name : t.assignee)}</span>
                    </div>
                  </td>
                  <td>
                    <span class="dgo-badge dgo-badge--${t.priority === 'HIGH' ? 'action' : (t.priority === 'MEDIUM' ? 'routed' : 'draft')}">${Sanitizer.escape(t.priority)}</span>
                  </td>
                </tr>
              `;
            }).join('');
          }

        } catch (err) {
          window.Chrome.showToast('Failed to coordinate operational streams.', 'error');
        }
        }
        loadHome();
        window.addEventListener('dgo:data-refreshed', loadHome); // in-place re-render
      });
