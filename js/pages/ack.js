/* Externalized page logic for ack.html (ARC-02 / SEC-03).
   Moved verbatim from the page's inline <script type="module"> block(s); no behavior
   change — handler functions remain window-attached. Page logic now lives in a real
   module file instead of an inline per-page monolith. */

      document.addEventListener('DOMContentLoaded', async () => {
        // Bootstrap navigation with no specific highlighting (as we are a standalone target)
        window.Chrome.bootstrap('tasks');

        let tasks = [];
        let officers = [];
        let activeTask = null;

        // Fetch URL query parameter: tasks link `ack.html?taskId=TSK-88124`
        const urlParams = new URLSearchParams(window.location.search);
        const taskId = urlParams.get('taskId');

        try {
          // Synchronize core officer databases
          const refs = await window.Lookups.loadReferences();
          officers = refs.officers || [];

          const response = await window.API.callPA('E04', {});
          tasks = response?.records || [];

          if (taskId) {
            verifyAndRenderTaskId(taskId);
          } else {
            document.getElementById('manual-verifier-card').style.display = 'block';
          }
        } catch(err) {
          window.Chrome.showToast('Failed to load validation registries.', 'error');
        }

        // Action on manual form verifier button
        document.getElementById('btn-verify-task-manual').addEventListener('click', () => {
          const rawId = document.getElementById('input-task-id').value.trim();
          if (!rawId) {
            window.Chrome.showToast('Please type a task identifier.', 'warning');
            return;
          }
          verifyAndRenderTaskId(rawId);
        });

        function verifyAndRenderTaskId(id) {
          const found = tasks.find(t => t.id.toUpperCase() === id.toUpperCase());
          if (!found) {
            window.Chrome.showToast('Task Identifier not found under active register stream.', 'error');
            document.getElementById('manual-verifier-card').style.display = 'block';
            document.getElementById('active-ack-card').style.display = 'none';
            return;
          }

          activeTask = found;
          document.getElementById('manual-verifier-card').style.display = 'none';
          document.getElementById('active-ack-card').style.display = 'block';

          // Populating targets
          document.getElementById('ack-task-ref').textContent = found.id;
          document.getElementById('ack-task-title').textContent = found.title;
          document.getElementById('ack-doc-ref').textContent = found.documentId;
          document.getElementById('ack-task-directives').textContent = found.directives || 'Directives not detailed.';

          const assigneeOfficer = officers.find(o => o.id === found.assignee);
          document.getElementById('ack-task-officer').textContent = assigneeOfficer ? assigneeOfficer.name : found.assignee;

          // Adjust state display based on current task status
          updateVisualState();
        }

        function updateVisualState() {
          const badge = document.getElementById('ack-task-badge');
          const btn = document.getElementById('btn-submit-ack');
          const successDiv = document.getElementById('ack-success-notes');
          const progressDiv = document.getElementById('ack-progress-box');

          if (activeTask.status === 'PENDING') {
            badge.className = 'dgo-badge dgo-badge--pending';
            badge.textContent = 'PENDING RECEIPT';
            btn.style.display = 'inline-flex';
            successDiv.style.display = 'none';
            progressDiv.style.display = 'none';
          } else {
            // Already acknowledged or completed
            badge.className = 'dgo-badge dgo-badge--routed';
            badge.textContent = activeTask.status === 'COMPLETED' ? 'COMPLETED' : 'ACKNOWLEDGED / REVIEWING';
            btn.style.display = 'none';
            successDiv.style.display = 'block';
            
            progressDiv.style.display = 'block';
            document.getElementById('ack-progress-val').textContent = `${activeTask.progress}%`;
            document.getElementById('ack-progress-bar').style.width = `${activeTask.progress}%`;
          }
        }

        // Submit acknowledgement callback
        document.getElementById('btn-submit-ack').addEventListener('click', async () => {
          if (!activeTask) return;

          try {
            window.Chrome.showToast('Acknowledging receipt directly in Power Automate...');
            
            // Call E05 status update with ACK defaults (10% progress, ROUTED status)
            const payload = {
              taskId: activeTask.id,
              progress: 10,
              status: 'ROUTED',
              notes: 'Receipt of executive directive verified and acknowledged by lead executor. Review in progress.'
            };

            const response = await window.API.callPA('E05', payload);
            if (response.success) {
              window.Chrome.showToast('Acknowledgement receipt logged!', 'success');
              
              // Apply update to memory
              activeTask.progress = 10;
              activeTask.status = 'ROUTED';
              activeTask.lastUpdateNotes = payload.notes;

              // Apply update to shared localStorage database
              const stored = window.API.getStoredTasks();
              const idx = stored.findIndex(t => t.id === activeTask.id);
              if (idx !== -1) {
                stored[idx].progress = 10;
                stored[idx].status = 'ROUTED';
                stored[idx].lastUpdateNotes = payload.notes;
                stored[idx].updatedAt = new Date().toISOString();
                window.API.saveStoredTasks(stored);
              }

              // Update visuals
              updateVisualState();
            } else {
              window.Chrome.showToast('Operational gateway rejected acknowledgement.', 'error');
            }
          } catch(err) {
            window.Chrome.showToast('Failed to route ACK transaction.', 'error');
          }
        });

      });
