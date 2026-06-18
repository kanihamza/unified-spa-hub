/* Externalized page logic for settings.html (ARC-02 / SEC-03).
   Moved verbatim from the page's inline <script type="module"> block(s); no behavior
   change — handler functions remain window-attached. Page logic now lives in a real
   module file instead of an inline per-page monolith. */

      document.addEventListener('DOMContentLoaded', async () => {
        window.Chrome.bootstrap('settings');

        // Render accessibility triggers active states
        function updateVisualControlsUI() {
          const s = window.State.getVisualSettings();
          
          // Theme toggles
          document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            if (btn.getAttribute('data-theme') === s.theme) {
              btn.classList.add('dgo-btn--primary');
              btn.classList.remove('dgo-btn--outline');
            } else {
              btn.classList.remove('dgo-btn--primary');
              btn.classList.add('dgo-btn--outline');
            }
          });

          // Density toggles
          document.querySelectorAll('.density-toggle-btn').forEach(btn => {
            if (btn.getAttribute('data-density') === s.density) {
              btn.classList.add('dgo-btn--primary');
              btn.classList.remove('dgo-btn--outline');
            } else {
              btn.classList.remove('dgo-btn--primary');
              btn.classList.add('dgo-btn--outline');
            }
          });
        }

        updateVisualControlsUI();

        // Bind theme click togglers
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const t = btn.getAttribute('data-theme');
            window.State.applyVisualSettings({ theme: t });
            updateVisualControlsUI();
            window.Chrome.showToast(`Theme preset changed to: ${t.toUpperCase()}`, 'success');
          });
        });

        // Bind density toggler
        document.querySelectorAll('.density-toggle-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const d = btn.getAttribute('data-density');
            window.State.applyVisualSettings({ density: d });
            updateVisualControlsUI();
            window.Chrome.showToast(`Density grid changed to: ${d.toUpperCase()}`, 'success');
          });
        });

        // Load custom endpoint forms
        const formEndpoints = window.API.getCustomEndpoints();
        for (const epKey in formEndpoints) {
          const input = document.getElementById(`ep-${epKey}`);
          if (input) {
            input.value = formEndpoints[epKey] || '';
          }
        }

        // Save customized flow URLs
        document.getElementById('btn-save-endpoints').addEventListener('click', () => {
          const formEndpoints = {};
          // Iterate the central registry (api.js) so every flow code is covered — no
          // hardcoded per-page key list (FR-016/FR-017).
          (window.API.FLOW_CODES || []).forEach(k => {
            const input = document.getElementById(`ep-${k}`);
            if (input) formEndpoints[k] = input.value ? input.value.trim() : "";
          });

          window.API.saveCustomEndpoints(formEndpoints);
          window.Chrome.showToast('Logic Flow endpoint gateways committed!', 'success');
        });

        // Restore URLs to defaults — actually clears every persisted override.
        document.getElementById('btn-restore-endpoints-default').addEventListener('click', () => {
          const cleared = {};
          (window.API.FLOW_CODES || []).forEach(k => {
            const input = document.getElementById(`ep-${k}`);
            if (input) input.value = '';
            cleared[k] = ''; // empty value → saveCustomEndpoints removes the override
          });
          window.API.saveCustomEndpoints(cleared);
          window.Chrome.showToast('Reverted to built-in default endpoints.', 'success');
        });

        // Lookup Cache Statistics
        function updateCacheCounters() {
          const cats = window.Lookups.getCategories().length;
          const officers = window.Lookups.getOfficers().length;
          const depts = window.Lookups.getDepartments().length;

          document.getElementById('lbl-cache-cats-count').textContent = cats;
          document.getElementById('lbl-cache-officers-count').textContent = officers;
          document.getElementById('lbl-cache-depts-count').textContent = depts;
        }

        updateCacheCounters();

        // Rebuild lookup cache
        document.getElementById('btn-rebuild-cache').addEventListener('click', async () => {
          window.Chrome.showToast('Rebuilding local lookups...');
          await window.Lookups.loadReferences(true);
          updateCacheCounters();
        });

        // Flush cache — via the owning modules' public APIs (STR-03), not raw keys.
        document.getElementById('btn-flush-cache').addEventListener('click', () => {
          if (window.Lookups && window.Lookups.clearCache) window.Lookups.clearCache();
          if (window.API && window.API.clearCache) window.API.clearCache();
          window.Chrome.showToast('Offline cache flushed! Modules will refetch on next load.', 'warning');
          updateCacheCounters();
        });

        // Telemetry Logs list viewer
        function renderLogsFeed() {
          const pane = document.getElementById('telemetry-logs-tbody');
          const logs = window.Telemetry.getLogs();

          if (logs.length === 0) {
            pane.innerHTML = `<div style="text-align:center; color: var(--dgo-color-fg-subtle); padding:var(--dgo-s-4); font-size:12px;">Logs history is clear. No active events.</div>`;
            return;
          }

          pane.innerHTML = logs.map(log => {
            const d = new Date(log.timestamp).toLocaleTimeString();
            const detailsText = Object.keys(log.details).length > 0 ? JSON.stringify(log.details) : '';
            
            let color = 'var(--dgo-color-fg-muted)';
            if (log.action.toLowerCase().includes('error') || log.action.toLowerCase().includes('fail')) {
              color = 'var(--dgo-color-action-danger)';
            } else if (log.action.toLowerCase().includes('success') || log.action.toLowerCase().includes('commit')) {
              color = 'var(--dgo-green-600)';
            } else if (log.action.toLowerCase().includes('api_')) {
              color = 'var(--dgo-color-action-accent)';
            }

            return `
              <div class="dgo-stack dgo-stack--0" style="font-family:var(--dgo-family-mono); font-size:10px; border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:4px; margin-bottom:4px;">
                <div class="dgo-cluster dgo-cluster--between">
                  <span style="font-weight:700; color:${color};">${Sanitizer.escape(log.action)}</span>
                  <span style="color:var(--dgo-color-fg-subtle); font-size:9px;">${d}</span>
                </div>
                ${detailsText ? `<span style="font-size:9px; color:var(--dgo-color-fg-subtle); word-break:break-all;">${Sanitizer.escape(detailsText)}</span>` : ''}
              </div>
            `;
          }).join('');
        }

        renderLogsFeed();

        // Flush telemetry
        document.getElementById('btn-flush-telemetry').addEventListener('click', () => {
          window.Telemetry.clearLogs();
          renderLogsFeed();
        });

        // Listen for new telemetry logs in real time
        window.addEventListener('dgo_telemetry_push', renderLogsFeed);

        // Local Storage Health (DATA-01) — explicit, continuously-monitored dashboard.
        function renderStorageHealth(stats) {
          stats = stats || (window.API && window.API.getStorageStats ? window.API.getStorageStats() : null);
          if (!stats) return;
          const bar = document.getElementById('storage-usage-bar');
          const text = document.getElementById('storage-usage-text');
          const badge = document.getElementById('storage-level-badge');
          const bd = document.getElementById('storage-breakdown');
          const colors = { ok: 'var(--dgo-color-action-accent)', warn: 'var(--dgo-color-warning-fg, #f59e0b)', high: '#ea580c', critical: 'var(--dgo-color-action-danger)' };
          if (bar) { bar.style.width = `${stats.percent}%`; bar.style.background = colors[stats.level] || colors.ok; }
          if (text) text.textContent = `${stats.percent}% — ${Math.round(stats.usedBytes / 1024)} KB / ${Math.round(stats.quotaBytes / 1024)} KB`;
          if (badge) {
            badge.textContent = stats.level.toUpperCase();
            badge.className = 'dgo-badge ' + (stats.level === 'ok' ? 'dgo-badge--pending' : stats.level === 'warn' ? 'dgo-badge--routed' : 'dgo-badge--action');
          }
          if (bd) {
            const rows = Object.keys(stats.breakdown || {}).sort((a, b) => stats.breakdown[b] - stats.breakdown[a]);
            bd.innerHTML = rows.map((k) =>
              `<div class="dgo-cluster dgo-cluster--between"><span>${Sanitizer.escape(k)}</span><span style="font-family:var(--dgo-family-mono);">${Math.round(stats.breakdown[k] / 1024)} KB</span></div>`
            ).join('') || '<span>No data stored yet.</span>';
          }
        }
        renderStorageHealth();
        window.addEventListener('dgo:storage-pressure', (e) => renderStorageHealth(e.detail));
        window.addEventListener('dgo:storage-error', () => renderStorageHealth());

        // Factory reset
        document.getElementById('btn-factory-reset').addEventListener('click', () => {
          if (confirm('Warning! This will clear all locally cached records in your browser storage (dossier flags, progress/comment logs, mailbox cache, identity selection) and restore initial state. Are you sure?')) {
            localStorage.clear();
            window.Chrome.showToast('Full factory operational reset complete! Refreshing page...', 'error');
            setTimeout(() => {
              window.location.reload();
            }, 1200);
          }
        });

      });

/* ───────────────────────── next inline block ───────────────────────── */

      document.addEventListener('DOMContentLoaded', () => {
        function renderOutbox() {
          const count = window.API.Outbox.get().length;
          const badge = document.getElementById('outbox-count-badge');
          if (badge) {
            badge.textContent = `${count} Pending`;
            badge.className = count > 0 ? 'dgo-badge dgo-badge--action' : 'dgo-badge dgo-badge--pending';
          }
          const dead = window.API.Outbox.getDeadLetter();
          const section = document.getElementById('deadletter-section');
          const dcount = document.getElementById('deadletter-count-badge');
          const list = document.getElementById('deadletter-list');
          if (section) section.style.display = dead.length ? 'block' : 'none';
          if (dcount) dcount.textContent = String(dead.length);
          if (list) {
            list.innerHTML = dead.map(item => `
              <div class="dgo-cluster dgo-cluster--between" style="font-size:11px; background:var(--dgo-color-surface-sunken); padding:6px 8px; border-radius:4px;">
                <span style="font-family:var(--dgo-family-mono);">${Sanitizer.escape(item.code)} · ${Sanitizer.escape(item.id)}</span>
                <span>
                  <button class="dgo-btn dgo-btn--sm dgo-btn--outline" data-retry="${Sanitizer.escape(item.id)}">Retry</button>
                  <button class="dgo-btn dgo-btn--sm dgo-btn--ghost" data-discard="${Sanitizer.escape(item.id)}">Discard</button>
                </span>
              </div>
            `).join('');
            list.querySelectorAll('[data-retry]').forEach(b => b.addEventListener('click', () => { window.API.Outbox.retryDeadLetter(b.getAttribute('data-retry')); renderOutbox(); }));
            list.querySelectorAll('[data-discard]').forEach(b => b.addEventListener('click', () => { window.API.Outbox.discardDeadLetter(b.getAttribute('data-discard')); renderOutbox(); }));
          }
        }
        // Outbox controls via public API (STR-03) + bound listeners (no inline handlers).
        const flushBtn = document.getElementById('btn-flush-outbox');
        if (flushBtn) flushBtn.addEventListener('click', () => { window.API.Outbox.process(); });
        const clearBtn = document.getElementById('btn-clear-queue');
        if (clearBtn) clearBtn.addEventListener('click', () => { window.API.Outbox.clearQueue(); location.reload(); });

        renderOutbox();
        window.addEventListener('dgo:outbox-delivered', renderOutbox);
        window.addEventListener('dgo:outbox-failed', renderOutbox);
      });
