(function(){
  "use strict";

  // Flow endpoints are centralized in js/api.js (window.API). This module calls
  // window.API.callPA('E0x', ...) — no isolated endpoint configuration here.

  const state = {
    varActiveView: 1, 
    activeTab: 'matched',      
    activeMatrixTab: 'emails', 
    varFlyoutOpen: false,
    varIsCompact: false,
    userEmail: '',
    varSelectedItem: null,     

    varActionStart: null,
    varActionName: '',
    varActionEnd: null,
    varActionDuration: 0,
    varActionDuration_s: 0,

    colDocsTracking: [],
    colTasksTracking: [],
    colEmailsTracking: [],
    colMatchedDocs: [],
    colDocEmailPairs: [],
    colDocTaskEmailMatrix: [],
    colActionTelemetry: [],
    colCategoriesInfo: [],
    colUsers: [],
    colDepartments: [],

    colActions: [
      { Label: 'Reload All', ActionKey: 'ReloadAll', Icon: '🔄', Tooltip: 'Reload all data' },
      { Label: 'Docs', ActionKey: 'Docs', Icon: '📄', Tooltip: 'Fetch documents' },
      { Label: 'Tasks', ActionKey: 'Tasks', Icon: '✅', Tooltip: 'Fetch tasks' },
      { Label: 'Emails', ActionKey: 'Emails', Icon: '📧', Tooltip: 'Fetch emails' },
      { Label: 'Dashboard', ActionKey: 'Dashboard', Icon: '🔗', Tooltip: 'Recalculate matches' },
      { Label: 'References', ActionKey: 'References', Icon: '📚', Tooltip: 'Fetch lookup data' },
    ],

    varDocCount: 0,
    varTaskCount: 0,
    varEmailsCount: 0,
    varEmailPairsCount: 0,
    varMatchedCount: 0,
    gblLastRunDuration: 0,
    gblLastRunCount: 0,

    locIsLoading: false,
    locDataError: false,
    locShowSuccess: false,
    locShowMenu: false,
    locShowTelemetry: false,
    locShowFilters: true,

    locSelectedDoc: null,      
    locSelectedEmail: null,    
    locSelectedTask: null,

    filterCategory: 'All',
    filterPriority: 'All',
    searchGlobal: '',
    searchEmail: '',

    gblSelect: '', gblExpand: '', gblFilter: '',
    gblStartTime: null, gblEndTime: null,

    _toastTimer: null
  };

  function safeDateParse(val) {
    if (!val) return null;
    try {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
  }

  function formatDateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dd = String(d.getDate()).padStart(2,'0');
    const mmm = months[d.getMonth()];
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const min = String(d.getMinutes()).padStart(2,'0');
    return `${dd}-${mmm}-${yyyy} ${hh}:${min}`;
  }

  function formatDateShort(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
  }

  function formatNow() { return formatDateTime(new Date()); }
  function msDiff(start) { return new Date() - start; }
  
  function escapeHtml(unsafe) {
    return String(unsafe||'').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function parseDocs(rawDocs) {
    return (rawDocs || []).map(item => ({
      ID: Number(item.ID) || 0,
      Title: item.Title || '',
      Description: item.Description || false,
      Category: item.Category || '',
      RefID_Text: item.RefIDD || '',
      AssignedTo: item.AssignedTo || '',
      Status: item.Status || '',
      AssignmentStatus: item.AssignmentStatus || '',
      StartDate: safeDateParse(item.Created),
      Modified: safeDateParse(item.Modified),
      Created: safeDateParse(item.Created),
      AuthorName: item.Author?.Title || '',
      AuthorEmail: item.Author?.EMail || '',
      EditorName: item.Editor?.Title || '',
      EditorEmail: item.Editor?.EMail || '',
      AttachmentLink: item.AttachmentLink || '',
      CC: item.CC_x0027_dTo || '',
      RoutedTo: item.Routed_x0020_To || '',
      Assigned: item.Assigned || '',
    }));
  }

  function parseTasks(rawTasks) {
    return (rawTasks || []).map(item => ({
      ID: Number(item.ID) || 0,
      Title: item.Title || '',
      Description: item.Description || false,
      Status: item.Progress || '',
      Priority: item.Priority || '',
      StartDate: safeDateParse(item.StartDate),
      DueDate: safeDateParse(item.DueDate),
      AssignedTo: item.AssignedTo || '',
      AuthorName: item.AuthorTitle || '',
      EditorEmail: item.EditorEmail || '',
      RefIDTitle: item.RefIDD || '',
      GDBLookUpTitle: Array.isArray(item.GBDLookUp) && item.GBDLookUp.length > 0 ? item.GBDLookUp[0]?.Title || '' : '',
      RoutedToDSU: item.GDSUROUT || '',
      Classification: item.Classification || '',
      Reference_ID: item.Reference_ID || '',
      Assigned: item.Assigned || '',
      Created: safeDateParse(item.Created),
    }));
  }

  function parseEmails(rawEmails) {
    return (rawEmails || []).map(item => ({
      id: item.id || '',
      Subject: item.subject || '',
      Body: item.bodyContent || item.body?.content || '',
      BodyPreview: item.bodyPreview || '',
      Importance: item.importance || '',
      DateTimeReceived: safeDateParse(item.receivedDateTime),
      From: item.fromAddress || item.from?.emailAddress?.address || '',
      FromName: item.fromName || item.from?.emailAddress?.name || '',
      To: Array.isArray(item.toRecipients) ? item.toRecipients.map(r => r.emailAddress?.address).join('; ') : '',
      Cc: Array.isArray(item.ccRecipients) ? item.ccRecipients.map(r => r.emailAddress?.address).join('; ') : '',
      Bcc: Array.isArray(item.bccRecipients) ? item.bccRecipients.map(r => r.emailAddress?.address).join('; ') : '',
      internetMessageId: item.internetMessageId || '',
      conversationId: item.conversationId || '',
      HasAttachments: Boolean(item.hasAttachments),
      Attachments: item.attachments || [],
      WebLink: item.webLink || '',
    }));
  }

  function computeDashboard() {
    state.colMatchedDocs = [];
    state.colDocEmailPairs = [];

    state.colDocsTracking.forEach(doc => {
      if (!doc.Title) return;
      const matchedEmails = state.colEmailsTracking.filter(email => {
        const titleLower = doc.Title.toLowerCase();
        const subjectLower = (email.Subject || '').toLowerCase();
        const bodyLower = (email.Body || '').toLowerCase();
        return subjectLower.includes(titleLower) || bodyLower.includes(titleLower);
      });

      if (matchedEmails.length > 0) {
        state.colMatchedDocs.push({
          ID: doc.ID,
          Created: doc.StartDate || doc.Created,
          Title: doc.Title,
          Category: doc.Category,
          AssignmentStatus: doc.AssignmentStatus,
          Status: doc.Status,
          AssignedTo: doc.AssignedTo,
          AttachmentLink: doc.AttachmentLink || '',
          CC: doc.CC || '',
          MatchingEmails: matchedEmails,
        });

        matchedEmails.forEach(email => {
          state.colDocEmailPairs.push({
            DocID: doc.ID,
            DocTitle: doc.Title,
            DocCategory: doc.Category,
            DocStatus: doc.Status,
            EmailSubject: email.Subject,
            EmailBody: email.Body,
            EmailFrom: email.From,
            EmailReceived: email.DateTimeReceived,
            HasAttachments: email.HasAttachments,
            Importance: email.Importance
          });
        });
      }
    });

    state.varMatchedCount = state.colMatchedDocs.length;
    state.varEmailPairsCount = state.colDocEmailPairs.length;
  }

  function buildDocTaskEmailMatrix() {
    state.colDocTaskEmailMatrix = state.colDocsTracking.map(doc => {
      const relatedTasks = state.colTasksTracking.filter(t => String(t.RefIDTitle) === String(doc.ID));
      const relatedEmails = state.colEmailsTracking.filter(email => {
        if (!doc.Title) return false;
        const tl = doc.Title.toLowerCase();
        return (email.Subject||'').toLowerCase().includes(tl) || (email.Body||'').toLowerCase().includes(tl);
      });
      return { ...doc, Tasks: relatedTasks, Responses: relatedEmails };
    });
  }

  function globalSearchFilter(collection, searchText) {
    if (!searchText) return collection;
    const q = searchText.toLowerCase();
    return collection.filter(item => Object.values(item).some(v => String(v||'').toLowerCase().includes(q)));
  }

  function filterByCategory(docs, category) {
    if (!category || category === 'All') return docs;
    return docs.filter(d => (d.Category||'') === category);
  }

  function filterByPriority(tasks, priority) {
    if (!priority || priority === 'All') return tasks;
    return tasks.filter(t => (t.Priority||'') === priority);
  }

  function searchEmails(emails, searchText) {
    if (!searchText) return emails;
    const q = searchText.toLowerCase();
    return emails.filter(e => (e.Subject||'').toLowerCase().includes(q) || (e.Body||'').toLowerCase().includes(q));
  }

  function sortEmailsDesc(emails) {
    return [...emails].sort((a, b) => {
      const da = a.DateTimeReceived ? new Date(a.DateTimeReceived).getTime() : 0;
      const db = b.DateTimeReceived ? new Date(b.DateTimeReceived).getTime() : 0;
      return db - da;
    });
  }

  function getStatusColor(status) {
    switch ((status || '').toLowerCase()) {
      case 'treated': case 'completed': return 'var(--success)';
      case 'in progress': case 'not started': case 'pending': return 'var(--warning)';
      case 'assigned': return '#2563EB';
      case 'not assigned': return 'var(--neutral-secondary)';
      case 'processed': return '#7C3AED';
      default: return 'var(--error)';
    }
  }

  function getPriorityColor(priority) {
    switch ((priority || '').toLowerCase()) {
      case 'high': return 'var(--error)';
      case 'medium': return 'var(--warning)';
      case 'low': return 'var(--success)';
      default: return 'var(--neutral-secondary)';
    }
  }

  function isOverdue(dateValue) {
    if (!dateValue) return false;
    return new Date(dateValue) < new Date();
  }

  function emailHighIndicator(importance) {
    return String(importance||'').toLowerCase() === 'high' ? 'HIGH🔴 ' : '';
  }

  function logTelemetry(ts, action, step, status, duration_ms, message) {
    state.colActionTelemetry.push({
      Timestamp: ts, Action: action, Step: step,
      Status: status, Duration_ms: duration_ms, Message: message
    });
  }

  window.executeAction = async function executeAction(actionKey, actionLabel) {
    const varActionStart = new Date();
    state.varActionName = actionLabel;
    state.locIsLoading = true;
    state.locDataError = false;
    state.colActionTelemetry = [];
    updateLoadingStatus(`Running ${actionLabel}...`);
    
    logTelemetry(varActionStart, actionLabel, 'Action_Start', 'Started', 0, '');
    let varStepStart;

    try {
      if (actionKey === 'Dashboard' || actionKey === 'ReloadAll') {
        varStepStart = new Date();
        try {
          computeDashboard();
          logTelemetry(new Date(), actionLabel, 'Dashboard_Recalculate', 'Success', msDiff(varStepStart), `Matched: ${state.colMatchedDocs.length}`);
        } catch (e) {
          state.locDataError = true;
          logTelemetry(new Date(), actionLabel, 'Dashboard_Recalculate', 'Error', msDiff(varStepStart), e.message);
        }
      }

      if (actionKey === 'Docs' || actionKey === 'ReloadAll') {
        varStepStart = new Date();
        updateLoadingStatus('Fetching Documents...');
        try {
          const res = await window.API.callPA('E02', { action: 'getDocs', operation: 'read', mode: 'read', source: 'DGO_FAST_Track_WEB_OPS', userEmail: state.userEmail, odataFilter: '' });
          state.colDocsTracking = parseDocs(res.records || res.docs || res.data?.docs);
          state.varDocCount = state.colDocsTracking.length;
          logTelemetry(new Date(), actionLabel, 'Docs_Fetch_Parse', 'Success', msDiff(varStepStart), `Rows: ${state.varDocCount}`);
        } catch (e) {
          state.locDataError = true;
          logTelemetry(new Date(), actionLabel, 'Docs_Fetch_Parse', 'Error', msDiff(varStepStart), e.message);
        }
      }

      if (actionKey === 'Tasks' || actionKey === 'ReloadAll') {
        varStepStart = new Date();
        updateLoadingStatus('Fetching Tasks...');
        state.gblStartTime = new Date();
        try {
          const res = await window.API.callPA('E04', { action: 'getTasks', operation: 'read', mode: 'read', source: 'DGO_FAST_Track_WEB_OPS', userEmail: state.userEmail, odataFilter: '' });
          state.colTasksTracking = parseTasks(res.records || res.tasks || res.data?.tasks);
          state.varTaskCount = state.colTasksTracking.length;
          state.gblEndTime = new Date();
          state.gblLastRunDuration = (state.gblEndTime - state.gblStartTime) / 1000;
          logTelemetry(new Date(), actionLabel, 'Tasks_Fetch_Parse', 'Success', msDiff(varStepStart), `Rows: ${state.varTaskCount}`);
        } catch (e) {
          state.locDataError = true;
          logTelemetry(new Date(), actionLabel, 'Tasks_Fetch_Parse', 'Error', msDiff(varStepStart), e.message);
        }
      }

      if (actionKey === 'Emails' || actionKey === 'ReloadAll') {
        varStepStart = new Date();
        updateLoadingStatus('Fetching Emails...');
        try {
          const res = await window.API.callPA('E09', { action: 'emailsfetch', operation: 'read', mode: 'read', source: 'DGO_FAST_Track_WEB_OPS', folderPath: 'Inbox', top: 50, skip: 0, fetchOnlyUnread: false });
          state.colEmailsTracking = parseEmails(res.records || res.emails || res.data?.emails);
          state.varEmailsCount = state.colEmailsTracking.length;
          logTelemetry(new Date(), actionLabel, 'Emails_Fetch_Parse', 'Success', msDiff(varStepStart), `Rows: ${state.varEmailsCount}`);
        } catch (e) {
          state.locDataError = true;
          logTelemetry(new Date(), actionLabel, 'Emails_Fetch_Parse', 'Error', msDiff(varStepStart), e.message);
        }
      }

      if (actionKey === 'References') {
        varStepStart = new Date();
        updateLoadingStatus('Fetching References...');
        try {
          const res = await window.API.callPA('E01', { action: 'lookups', operation: 'read', mode: 'read', source: 'DGO_FAST_Track_WEB_OPS', userEmail: state.userEmail });
          const data = res.data || res;
          state.colCategoriesInfo = data.categories || [];
          state.colUsers = data.users || [];
          state.colDepartments = data.departments || [];
          populateCategoryDropdown();
          logTelemetry(new Date(), actionLabel, 'References_Fetch', 'Success', msDiff(varStepStart), `Cats: ${state.colCategoriesInfo.length}`);
        } catch (e) {
          state.locDataError = true;
          logTelemetry(new Date(), actionLabel, 'References_Fetch', 'Error', msDiff(varStepStart), e.message);
        }
      }

      if (actionKey === 'ReloadAll') {
        varStepStart = new Date();
        try {
          computeDashboard();
          buildDocTaskEmailMatrix();
          logTelemetry(new Date(), actionLabel, 'ReloadAll_Recalculate', 'Success', msDiff(varStepStart), `Matched: ${state.colMatchedDocs.length}`);
        } catch (e) {
          state.locDataError = true;
          logTelemetry(new Date(), actionLabel, 'ReloadAll_Recalculate', 'Error', msDiff(varStepStart), e.message);
        }
      }

      if (!['Dashboard','Docs','Tasks','Emails','ReloadAll','References'].includes(actionKey)) {
        logTelemetry(new Date(), actionLabel, 'Action_Not_Implemented', 'Warning', 0, `Key: ${actionKey}`);
      }

      if (!state.locDataError && ['Docs','Tasks','Emails','ReloadAll'].includes(actionKey)) {
        showSuccessToast();
      }

    } finally {
      state.varActionDuration = new Date() - varActionStart;
      logTelemetry(new Date(), actionLabel, 'Action_End', state.locDataError ? 'Error' : 'Success', state.varActionDuration, 'Total execution time');
      state.locIsLoading = false;
      state.locShowTelemetry = true;
      render(); 
    }
  }

  function getNavItemsForUser() {
    const allItems = [
      { name: 'Home', view: 'home', icon: '🏠', color: '#05583B' },
      { name: 'E-mails', view: 'emails', icon: '📧', color: '#373435' },
      { name: 'Activities', view: 'activities', icon: '📋', color: '#00A69D' },
      { name: 'Task', view: 'tasks', icon: '✅', color: '#05583B' },
      { name: 'Bulk Tagging', view: 'bulktagging', icon: '🏷️', color: '#373435' },
      { name: 'Support', view: 'support', icon: '❓', color: '#00A69D' },
      { name: 'Maintenance', view: 'maintenance', icon: '🔧', color: '#373435' },
      { name: 'Settings', view: 'settings', icon: '⚙️', color: '#05583B' },
    ];
    // Section labels are NOT gated by hardcoded emails (DATA-01). Access control is the
    // responsibility of the shared identity / gateway model (window.Identity).
    return [allItems[0], ...allItems.filter(i => i.view !== 'home').sort((a, b) => a.name.localeCompare(b.name))];
  }

  function render() {
    updateOverlays();
    renderHeader();
    renderFilterBar();
    renderActionRibbon();
    renderColA();
    renderColB();
    renderTelemetry();
    renderSideNav();
    renderMobileLayout();
    attachEventListeners();
  }

  function renderHeader() {
    const dc = document.getElementById('docs-count');
    if (dc) dc.textContent = String(state.colDocsTracking.length);
    const dt = document.getElementById('header-datetime');
    if (dt) {
      dt.textContent = formatNow();
      dt.style.display = state.varIsCompact ? 'none' : 'block';
    }
  }

  function renderFilterBar() {
    const fb = document.getElementById('filter-bar');
    if (!fb) return;
    if (!state.varIsCompact) {
      fb.style.display = 'flex';
      return;
    }
    fb.style.display = state.locShowFilters ? 'flex' : 'none';
  }

  function updateOverlays() {
    document.getElementById('loading-overlay').style.display = state.locIsLoading ? 'flex' : 'none';
    document.getElementById('error-banner').style.display = state.locDataError ? 'flex' : 'none';
    const toast = document.getElementById('success-toast');
    if (state.locShowSuccess) {
      toast.style.display = 'flex';
      if (state._toastTimer) clearTimeout(state._toastTimer);
      state._toastTimer = setTimeout(() => { state.locShowSuccess = false; toast.style.display = 'none'; state._toastTimer = null; }, 3000);
    } else {
      toast.style.display = 'none';
    }
  }

  function updateLoadingStatus(msg) {
    const el = document.getElementById('loading-text');
    if(el) el.textContent = msg;
  }
  
  function showSuccessToast() {
    state.locShowSuccess = true;
    updateOverlays();
  }
  
  window.clearError = function() { state.locDataError = false; render(); }

  function renderActionRibbon() {
    const countsMap = {
      'Docs': state.colDocsTracking.length,
      'Tasks': state.colTasksTracking.length,
      'Emails': state.colEmailsTracking.length,
      'Dashboard': state.colMatchedDocs.length
    };

    const html = state.colActions.map(item => `
      <button class="ribbon-btn" title="${item.Tooltip}" onclick="executeAction('${item.ActionKey}', '${item.Label}')">
        <div style="font-size:16px;margin-bottom:4px;">${item.Icon}</div>
        <div style="display:flex;justify-content:space-between;width:100%;align-items:flex-end;">
          <span class="btn-label">${item.Label}</span>
          <span class="btn-count">${countsMap[item.ActionKey] !== undefined ? countsMap[item.ActionKey] : ''}</span>
        </div>
      </button>
    `).join('');
    const ribbon = document.getElementById('action-ribbon');
    if(ribbon) ribbon.innerHTML = html;
  }

  function renderColA() {
    const container = document.getElementById('col-a-content');
    if(!container) return;
    let html = '';
    
    const countMatched = document.getElementById('count-matched');
    if(countMatched) countMatched.textContent = state.colMatchedDocs.length;
    const countPairs = document.getElementById('count-pairs');
    if(countPairs) countPairs.textContent = state.colDocEmailPairs.length;

    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
      if (b.dataset.tab === state.activeTab) b.classList.add('active');
    });

    if (state.activeTab === 'matched') {
      let data = filterByCategory(state.colMatchedDocs, state.filterCategory);
      data = globalSearchFilter(data, state.searchGlobal);
      
      if (data.length === 0) {
        html = `<div class="empty-state"><h4>No matched documents</h4><p>Click 'Dashboard' in the ribbon to build matches.</p></div>`;
      } else {
        html = data.map(doc => `
          <div class="gallery-item ${state.locSelectedDoc?.ID === doc.ID ? 'selected' : ''}" onclick="selectDoc(${doc.ID}, 'matched')">
            <div class="item-title">${escapeHtml(doc.Title)}</div>
            <div class="item-meta-line">
              <span class="item-meta">Category: ${escapeHtml(doc.Category || '—')}</span>
              <span class="status-badge" style="background:${getStatusColor(doc.Status)};font-size:8px;">${doc.Status||'—'}</span>
            </div>
          </div>
        `).join('');
      }
    } 
    else if (state.activeTab === 'pairs') {
      let data = globalSearchFilter(state.colDocEmailPairs, state.searchGlobal);
      if (data.length === 0) {
        html = `<div class="empty-state"><h4>No Doc-Email Pairs</h4><p>Run Dashboard to build pairs.</p></div>`;
      } else {
        html = data.map(pair => `
          <div class="gallery-item">
            <div class="item-title">${escapeHtml(pair.DocTitle)}</div>
            <div class="item-meta">Cat: ${escapeHtml(pair.DocCategory)} • Status: ${pair.DocStatus}</div>
            <div style="font-size:10px;color:var(--brand-primary);margin-top:4px;">↳ ${emailHighIndicator(pair.Importance)}${pair.HasAttachments ? '📎 ' : ''}${escapeHtml(pair.EmailSubject)}</div>
          </div>
        `).join('');
      }
    }
    else if (state.activeTab === 'matrix') {
      let data = globalSearchFilter(state.colDocTaskEmailMatrix, state.searchGlobal);
      if (data.length === 0) {
        html = `<div class="empty-state"><h4>No Response Matrix Data</h4><p>Reload all data to generate matrix.</p></div>`;
      } else {
        html = data.map(item => `
          <div class="gallery-item matrix-item ${state.varSelectedItem?.ID === item.ID ? 'selected' : ''}" onclick="selectDoc(${item.ID}, 'matrix')">
            <div class="matrix-title">${escapeHtml(item.Title)}</div>
            <div class="matrix-meta">Assigned To: ${escapeHtml(item.AssignedTo || 'Unassigned')}</div>
            <div class="matrix-meta">Category: ${escapeHtml(item.Category || '—')}</div>
            <div class="matrix-meta" style="color:${isOverdue(item.Created) ? 'var(--error)' : 'var(--neutral-primary)'}">Created: ${formatDateShort(item.Created)}</div>
            <div class="matrix-meta">Status: <span style="color:${getStatusColor(item.Status)};font-weight:bold;">${item.Status||'Unknown'}</span></div>
          </div>
        `).join('');
      }
    }
    container.innerHTML = html;
  }

  function renderColB() {
    const header = document.getElementById('doc-header');
    const searchBar = document.getElementById('email-search-bar');
    const emptyState = document.getElementById('detail-empty-state');
    const emailGallery = document.getElementById('matching-emails-gallery');
    const taskGallery = document.getElementById('related-tasks-gallery');
    const matrixTabs = document.getElementById('matrix-sub-tabs');

    if(!header) return;

    emailGallery.style.display = 'none';
    taskGallery.style.display = 'none';
    matrixTabs.style.display = 'none';

    let activeItem = state.activeTab === 'matched' ? state.locSelectedDoc : (state.activeTab === 'matrix' ? state.varSelectedItem : null);

    if (!activeItem || state.activeTab === 'pairs') {
      header.style.display = 'none';
      searchBar.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    header.style.display = 'flex';
    emptyState.style.display = 'none';
    document.getElementById('doc-title').textContent = activeItem.Title || 'Untitled Document';
    
    let metaHtml = `ID: ${activeItem.ID} | Category: ${escapeHtml(activeItem.Category||'—')}`;
    if (activeItem.AttachmentLink) metaHtml += ` | <a href="${window.Sanitizer.safeUrl(activeItem.AttachmentLink)}" target="_blank" rel="noopener noreferrer" style="color:var(--brand-secondary);">📎 View Document</a>`;
    if (activeItem.CC) {
      const ccs = activeItem.CC.split(';').filter(Boolean).map(c=>`<span style="background:#e0e0e0;padding:2px 4px;border-radius:2px;font-size:8px;">${escapeHtml(c)}</span>`).join(' ');
      metaHtml += ` | CC: ${ccs}`;
    }
    document.getElementById('doc-meta').innerHTML = metaHtml;

    const badge = document.getElementById('doc-status-badge');
    badge.style.display = 'inline-block';
    badge.textContent = activeItem.Status || '—';
    badge.style.background = getStatusColor(activeItem.Status);

    if (state.activeTab === 'matched') {
      searchBar.style.display = 'block';
      emailGallery.style.display = 'block';
      const emails = searchEmails(sortEmailsDesc(activeItem.MatchingEmails || []), state.searchEmail);
      emailGallery.innerHTML = renderEmailCards(emails);
    } 
    else if (state.activeTab === 'matrix') {
      searchBar.style.display = 'block';
      matrixTabs.style.display = 'flex';
      
      document.getElementById('tab-matrix-emails').classList.toggle('active', state.activeMatrixTab === 'emails');
      document.getElementById('tab-matrix-tasks').classList.toggle('active', state.activeMatrixTab === 'tasks');

      if (state.activeMatrixTab === 'emails') {
        emailGallery.style.display = 'block';
        const emails = searchEmails(sortEmailsDesc(activeItem.Responses || []), state.searchEmail);
        emailGallery.innerHTML = renderEmailCards(emails);
      } else {
        taskGallery.style.display = 'block';
        const tasks = filterByPriority(activeItem.Tasks || [], state.filterPriority);
        if(tasks.length === 0) {
           taskGallery.innerHTML = `<div class="empty-state"><h4>No Tasks</h4><p>No related tasks found for this document.</p></div>`;
        } else {
           taskGallery.innerHTML = tasks.map(t => `
            <div class="task-card ${t.Status?.toLowerCase().startsWith('not started') ? 'not-started' : ''}">
              <div class="task-priority-bar" style="background:${getPriorityColor(t.Priority)}"></div>
              <div class="task-content">
                <div class="task-title">${escapeHtml(t.Title || 'No Subject')}</div>
                <div class="task-desc">${escapeHtml(t.Description || '')}</div>
                <div class="task-sender">From: ${escapeHtml(t.AssignedTo || 'Unknown')} | Routed: ${escapeHtml(t.RoutedToDSU || '—')} <br> Ref: <b>${escapeHtml(t.Reference_ID)}</b></div>
              </div>
            </div>
          `).join('');
        }
      }
    }
  }

  function renderEmailCards(emails) {
    if (emails.length === 0) return `<div class="empty-state"><h4>No Emails</h4><p>No matching emails found.</p></div>`;
    return emails.map(e => `
      <div class="email-card" onclick="openEmailDetail('${e.id}')">
        <h3>${emailHighIndicator(e.Importance)}${e.HasAttachments?'📎 ':''}${escapeHtml(e.Subject || 'No Subject')}</h3>
        <p><strong>From:</strong> ${escapeHtml(e.From || e.FromName)} &nbsp;|&nbsp; <strong>Date:</strong> ${formatDateTime(e.DateTimeReceived)}</p>
        <div class="email-body-preview">${escapeHtml((e.BodyPreview || '').slice(0,100))}...</div>
      </div>
    `).join('');
  }

  function renderTelemetry() {
    const panel = document.getElementById('telemetry-panel');
    const cont = document.getElementById('telemetry-content');
    const nodata = document.getElementById('telemetry-no-data');
    
    if(!panel) return;

    if (!state.locShowTelemetry) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';

    if (state.colActionTelemetry.length === 0) {
      cont.style.display = 'none'; nodata.style.display = 'block'; return;
    }
    
    cont.style.display = 'block'; nodata.style.display = 'none';
    const tbody = document.getElementById('telemetry-tbody');
    tbody.innerHTML = state.colActionTelemetry.map(t => `
      <tr>
        <td>${formatDateTime(t.Timestamp)}</td>
        <td>${t.Action}</td>
        <td>${t.Step}</td>
        <td class="telemetry-status-${(t.Status||'').toLowerCase()}">${t.Status}</td>
        <td>${t.Duration_ms}</td>
        <td>${escapeHtml(t.Message)}</td>
      </tr>
    `).join('');

    const agg = {};
    state.colActionTelemetry.forEach(r => {
      const k = r.Step || 'Unknown';
      if (!agg[k]) agg[k] = { Step: k, Duration_ms: 0, Runs: 0 };
      agg[k].Duration_ms += Number(r.Duration_ms || 0);
      agg[k].Runs += 1;
    });
    const rows = Object.values(agg);
    const maxDur = Math.max(...rows.map(d => d.Duration_ms || 0), 1);
    const maxRuns = Math.max(...rows.map(d => d.Runs || 0), 1);

    const bars = rows.map(d => {
      const durPct = ((d.Duration_ms || 0) / maxDur) * 100;
      const runPct = ((d.Runs || 0) / maxRuns) * 100;
      return `
        <div class="chart-row">
          <div class="chart-label" title="${d.Step}">${d.Step}</div>
          <div style="flex:1;display:flex;flex-direction:column;gap:3px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <div class="chart-bar" style="width:${durPct}%;max-width:80%;background:var(--brand-primary);"></div>
              <span class="chart-val">${d.Duration_ms}ms</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <div class="chart-bar" style="width:${runPct}%;max-width:80%;background:var(--brand-secondary);height:10px;"></div>
              <span class="chart-val">${d.Runs} run(s)</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
    document.getElementById('telemetry-chart').innerHTML = `<div class="chart-bar-container">${bars}</div>`;
  }

  function renderSideNav() {
    const items = getNavItemsForUser();
    const navUser = document.getElementById('nav-user-email');
    if(navUser) navUser.textContent = state.userEmail || 'No identity selected';
    const cont = document.getElementById('nav-items-container');
    if(!cont) return;
    const html = items.map(i => `
      <button class="nav-btn" onclick="toggleMenu(false)">
        <span style="font-size:16px;">${i.icon}</span> ${i.name}
      </button>
    `).join('');
    cont.innerHTML = html;
  }

  function renderMobileLayout() {
    const colA = document.getElementById('col-a');
    const colB = document.getElementById('col-b');
    const btnBack = document.getElementById('back-to-list-btn');

    if(!colA || !colB) return;

    if (!state.varIsCompact) {
      colA.classList.remove('hide-mobile');
      colB.classList.remove('show-mobile');
      if(btnBack) btnBack.style.display = 'none';
      return;
    }
    
    const hasSelection = (state.activeTab === 'matched' && state.locSelectedDoc) || (state.activeTab === 'matrix' && state.varSelectedItem);
    
    if (hasSelection) {
      colA.classList.add('hide-mobile');
      colB.classList.add('show-mobile');
      if(btnBack) btnBack.style.display = 'block';
    } else {
      colA.classList.remove('hide-mobile');
      colB.classList.remove('show-mobile');
    }
  }

  window.switchTab = function(tab) {
    state.activeTab = tab;
    clearSelection();
    render();
  }
  
  window.switchMatrixTab = function(subtab) {
    state.activeMatrixTab = subtab;
    renderColB();
  }

  window.selectDoc = function(id, type) {
    if (type === 'matched') {
      state.locSelectedDoc = state.colMatchedDocs.find(d => d.ID === id);
    } else if (type === 'matrix') {
      state.varSelectedItem = state.colDocTaskEmailMatrix.find(d => d.ID === id);
    }
    render();
  }

  window.clearSelection = function() {
    state.locSelectedDoc = null;
    state.varSelectedItem = null;
    state.searchEmail = '';
    const emailSearchInput = document.getElementById('email-search');
    if(emailSearchInput) emailSearchInput.value = '';
    closeEmailDetail();
    render();
  }

  window.openEmailDetail = function(emailId) {
    const activeItem = state.activeTab === 'matched' ? state.locSelectedDoc : state.varSelectedItem;
    if (!activeItem) return;
    const list = state.activeTab === 'matched' ? (activeItem.MatchingEmails||[]) : (activeItem.Responses||[]);
    const email = list.find(e => e.id === emailId);
    if(!email) return;
    
    state.locSelectedEmail = email;
    const panel = document.getElementById('email-detail-panel');
    if(!panel) return;
    document.getElementById('email-detail-subject').textContent = email.Subject || 'No Subject';
    document.getElementById('email-detail-meta').textContent = `From: ${email.From} | Date: ${formatDateTime(email.DateTimeReceived)}`;
    
    // Render the (untrusted) email body through the centralized sanitizer, which
    // strips scripts/event-handlers and dangerous href/src schemes via its safelist.
    // (Replaces the prior iframe srcdoc pattern, whose safety depended solely on the
    // sandbox attribute and silently double-decoded the escaped body.)
    const safeBody = (window.Sanitizer && window.Sanitizer.cleanHTML)
      ? window.Sanitizer.cleanHTML(email.Body || '')
      : escapeHtml(email.Body || '');
    document.getElementById('email-detail-body').innerHTML =
      `<div class="email-body-rendered" style="width:100%;height:100%;overflow:auto;padding:4px;">${safeBody}</div>`;
    
    panel.style.display = 'flex';
  }

  window.closeEmailDetail = function() {
    state.locSelectedEmail = null;
    const panel = document.getElementById('email-detail-panel');
    if(panel) panel.style.display = 'none';
    const body = document.getElementById('email-detail-body');
    if(body) body.innerHTML = '';
  }

  window.toggleMenu = function(force) {
    state.locShowMenu = force !== undefined ? force : !state.locShowMenu;
    const nav = document.getElementById('side-nav');
    const overlay = document.getElementById('side-nav-overlay');
    if(nav) nav.classList.toggle('open', state.locShowMenu);
    if(overlay) overlay.style.display = state.locShowMenu ? 'block' : 'none';
  }

  window.toggleTelemetry = function() {
    state.locShowTelemetry = !state.locShowTelemetry;
    renderTelemetry();
  }

  window.toggleFilters = function(force) {
    state.locShowFilters = force !== undefined ? force : !state.locShowFilters;
    renderFilterBar();
  }

  window.saveUserEmail = function() {
    const el = document.getElementById('init-email-input');
    const val = el ? el.value.trim() : '';
    if(val) {
      state.userEmail = val;
      const modal = document.getElementById('email-prompt-modal');
      if(modal) modal.style.display = 'none';
      const hdr = document.getElementById('header-user-info');
      if(hdr) {
        hdr.textContent = val;
        hdr.style.display = 'block';
      }
      renderSideNav();
    }
  }

  function debounce(fn, ms) {
    let t;
    return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }

  function populateCategoryDropdown() {
    const el = document.getElementById('category-filter');
    if(!el) return;
    const cats = ['All', ...new Set(state.colCategoriesInfo.map(c => c.Category).filter(Boolean))];
    el.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}" ${c === state.filterCategory ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  }

  function attachEventListeners() {
    const bind = (id, evt, handler) => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = `bound_${evt}`;
      if (el.dataset[key] === '1') return;
      el.addEventListener(evt, handler);
      el.dataset[key] = '1';
    };

    bind('hamburger-btn', 'click', () => toggleMenu());
    bind('hamburger-filter-btn', 'click', () => toggleFilters());
    bind('close-nav-btn', 'click', () => toggleMenu(false));
    bind('docs-count-btn', 'click', () => executeAction('Docs', 'Docs'));

    const gSearch = document.getElementById('global-search');
    if (gSearch && !gSearch.dataset.bound_input) {
      gSearch.addEventListener('input', debounce(e => { state.searchGlobal = e.target.value; renderColA(); }, 300));
      gSearch.dataset.bound_input = '1';
    }

    const eSearch = document.getElementById('email-search');
    if (eSearch && !eSearch.dataset.bound_input) {
      eSearch.addEventListener('input', debounce(e => { state.searchEmail = e.target.value; renderColB(); }, 300));
      eSearch.dataset.bound_input = '1';
    }

    const cat = document.getElementById('category-filter');
    if (cat && !cat.dataset.bound_change) {
      cat.addEventListener('change', e => { state.filterCategory = e.target.value; renderColA(); });
      cat.dataset.bound_change = '1';
    }

    const pri = document.getElementById('priority-filter');
    if (pri && !pri.dataset.bound_change) {
      pri.addEventListener('change', e => { state.filterPriority = e.target.value; renderColB(); });
      pri.dataset.bound_change = '1';
    }

    const closeEmail = document.getElementById('close-email-btn');
    if (closeEmail && !closeEmail.dataset.bound_click) {
      closeEmail.addEventListener('click', () => closeEmailDetail());
      closeEmail.dataset.bound_click = '1';
    }
  }

  function init() {
    if (window.Chrome) window.Chrome.bootstrap('fast-track');

    // Identity comes from the shared model (sidebar switcher / OTP session), not a
    // separate fast-track email prompt (DATA-01). Changing identity reloads the page,
    // so reading it here keeps fast-track in sync.
    const activeUser = (window.State && window.State.getActiveUser) ? window.State.getActiveUser() : null;
    state.userEmail = (activeUser && activeUser.email) ? activeUser.email : '';
    const hdr = document.getElementById('header-user-info');
    if (hdr) {
      hdr.textContent = state.userEmail || 'Select identity in the sidebar';
      hdr.style.display = 'block';
    }
    const modal = document.getElementById('email-prompt-modal');
    if (modal) modal.style.display = 'none';

    state.varIsCompact = window.innerWidth < 768;
    state.locShowFilters = !state.varIsCompact;
    render();

    // No auto-refresh: counts update on user action / global refresh, not on a timer.
    window.addEventListener('dgo:data-refreshed', () => { if (window.executeAction) window.executeAction('ReloadAll', 'Refresh'); });

    window.addEventListener('resize', () => {
      state.varIsCompact = window.innerWidth < 768;
      if (!state.varIsCompact) state.locShowFilters = true;
      render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
