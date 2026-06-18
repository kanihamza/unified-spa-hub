// Dependency-free unit tests for the platform's core logic (api.js + sanitizer.js).
// Pure Node + the built-in `vm` module — NO runtime/test dependencies are added.
// The browser globals the modules touch are shimmed minimally so the IIFEs can run
// headless. Covers the remediations the real-browser smoke cannot reach deeply:
//   INT-01 (outbox single-flight / exactly-once + idempotency header)
//   REL-01 (write timeout path is present)
//   DATA-01 (storage-failure surfaced, not swallowed)
//   INF-01 (environment profile selection)
//   INT-02 (response normalization contract)
//   STR-01/SEC-03 (single canonical escaper + safeUrl scheme filtering)
// Run:  node test/unit.mjs   (or: npm run unit)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function assert(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
}
const tick = () => new Promise((r) => setTimeout(r, 5));

function makeStore() {
  let m = {}; let throwOnSet = false;
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => {
      if (throwOnSet) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m[k] = String(v);
    },
    removeItem: (k) => { delete m[k]; },
    clear: () => { m = {}; },
    get length() { return Object.keys(m).length; },
    __setThrow: (b) => { throwOnSet = b; },
    __dump: () => ({ ...m })
  };
}

// Build a fresh headless platform context and run sanitizer.js + api.js inside it.
function loadPlatform({ hostname = 'localhost', online = true, fetchImpl, profile = null, scripts = ['js/sanitizer.js', 'js/api.js'] } = {}) {
  const listeners = {};
  const ls = makeStore();
  if (profile) ls.setItem('dgo_env_profile', profile);
  const ss = makeStore();
  const sandbox = {
    console, JSON, Math, Date, Promise, Object, Array, String, Number, Boolean, RegExp, Error,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    AbortController, CustomEvent,
    localStorage: ls, sessionStorage: ss,
    navigator: { onLine: online },
    location: { hostname },
    addEventListener: (t, cb) => { (listeners[t] ||= []).push(cb); },
    removeEventListener: (t, cb) => { listeners[t] = (listeners[t] || []).filter((f) => f !== cb); },
    dispatchEvent: (evt) => { (listeners[evt.type] || []).forEach((cb) => { try { cb(evt); } catch {} }); return true; },
    document: {
      readyState: 'loading', // defer boot() so tests drive fetchAll() explicitly
      addEventListener: (t, cb) => { (listeners['doc:' + t] ||= []).push(cb); },
      getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {}, innerHTML: '' }),
      body: { appendChild() {} }, documentElement: { appendChild() {} }
    }
  };
  sandbox.fetch = (...a) => sandbox.__fetch(...a);
  sandbox.__fetch = fetchImpl || (async () => ({ ok: true, json: async () => ({ success: true }) }));
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const f of scripts) {
    vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  return { sandbox, ls, ss, listeners };
}

(async () => {
  // ── INT-01: outbox single-flight / exactly-once + idempotency header ──────────
  {
    let calls = 0; let lastHeaders = null;
    const { sandbox } = loadPlatform({
      fetchImpl: async (url, opts) => { calls++; lastHeaders = opts.headers; await tick(); return { ok: true, json: async () => ({ success: true }) }; }
    });
    const API = sandbox.window.API;
    await API.callPA('E03', { docId: 1, status: 'CLEARED' }); // write → enqueue + kick process
    const p1 = API.Outbox.process();   // concurrent triggers must coalesce
    const p2 = API.Outbox.process();
    await Promise.all([p1, p2]);
    await API.Outbox.process();
    assert('INT-01 write delivered exactly once under concurrency', calls === 1, `fetches=${calls}`);
    assert('INT-01 idempotency key sent (X-DGO-Tx-ID)', !!(lastHeaders && lastHeaders['X-DGO-Tx-ID']));
    assert('INT-01 queue drained after delivery', API.Outbox.get().length === 0, `len=${API.Outbox.get().length}`);
  }

  // ── INT-01: two distinct writes both delivered (single-flight ≠ dropped work) ──
  {
    let calls = 0;
    const { sandbox } = loadPlatform({ fetchImpl: async () => { calls++; await tick(); return { ok: true, json: async () => ({}) }; } });
    const API = sandbox.window.API;
    await API.callPA('E03', { a: 1 });
    await API.callPA('E06', { b: 2 });
    const a = API.Outbox.process(); const b = API.Outbox.process();
    await Promise.all([a, b]); await API.Outbox.process();
    assert('INT-01 two queued writes deliver exactly twice (no loss, no dupes)', calls === 2, `fetches=${calls}`);
  }

  // ── INT-01/REL-01: a failed write is retried, never lost (stays queued) ────────
  {
    let calls = 0;
    const { sandbox } = loadPlatform({ fetchImpl: async () => { calls++; return { ok: false, status: 500, json: async () => ({}) }; } });
    const API = sandbox.window.API;
    await API.callPA('E03', { a: 1 });
    await API.Outbox.process();
    const q = API.Outbox.get();
    assert('REL-01 failed write retained in queue with incremented attempts', q.length === 1 && q[0].attempts >= 1, `len=${q.length} attempts=${q[0] && q[0].attempts}`);
  }

  // ── DATA-01: storage write failure is surfaced, not silently swallowed ─────────
  {
    const data = { ok: true, data: { docs: [{ ID: 1, Title: 't' }], tasks: [], emails: [], users: [], categories: [], departments: [] } };
    const { sandbox, ls } = loadPlatform({ fetchImpl: async () => ({ ok: true, json: async () => data }) });
    const API = sandbox.window.API;
    let errFired = false;
    sandbox.window.addEventListener('dgo:storage-error', () => { errFired = true; });
    ls.__setThrow(true);
    await API.fetchAll();
    assert('DATA-01 storage failure surfaced via dgo:storage-error', errFired);
    ls.__setThrow(false);
  }

  // ── INF-01: environment profile selection ─────────────────────────────────────
  {
    assert('INF-01 localhost → dev', loadPlatform({ hostname: 'localhost' }).sandbox.window.API.getEnvironment() === 'dev');
    assert('INF-01 staging host → test', loadPlatform({ hostname: 'dgo.staging.gov.ng' }).sandbox.window.API.getEnvironment() === 'test');
    assert('INF-01 prod host → prod', loadPlatform({ hostname: 'hub.nitda.gov.ng' }).sandbox.window.API.getEnvironment() === 'prod');
    assert('INF-01 forced profile overrides host', loadPlatform({ hostname: 'localhost', profile: 'prod' }).sandbox.window.API.getEnvironment() === 'prod');
  }

  // ── INT-02: response normalization contract (live envelope → canonical records) ─
  {
    const { sandbox } = loadPlatform();
    const API = sandbox.window.API;
    const d = API.normalizeResponse('E02', { docs: [{ ID: 9, Title: 'X', AssignmentStatus: 'ROUTED' }] });
    assert('INT-02 E02 docs normalized (id/title/status + records)', d.records[0].id === 9 && d.records[0].title === 'X' && d.records[0].status === 'ROUTED');
    const t = API.normalizeResponse('E04', { tasks: [{ ID: 1, Title: 'Y', Progress: 'Pending', Description: true }] });
    assert('INT-02 E04 boolean Description exposed as hasDescription', t.records[0].hasDescription === true && t.records[0].status === 'Pending');
  }

  // ── STR-01/SEC-03: single canonical escaper + safeUrl scheme filtering ─────────
  {
    const { sandbox } = loadPlatform();
    const S = sandbox.window.Sanitizer;
    assert('STR-01 escapeHtml encodes all five metacharacters', S.escapeHtml(`<b>&"'`) === '&lt;b&gt;&amp;&quot;&#39;', S.escapeHtml(`<b>&"'`));
    assert('STR-01 escape() delegates to the single escapeHtml impl', S.escape === S.escapeHtml);
    assert('SEC-03 safeUrl neutralizes javascript: scheme', S.safeUrl('javascript:alert(1)') === '#');
    assert('SEC-03 safeUrl attribute-encodes ampersands', S.safeUrl('https://x.test/a?b=1&c=2').includes('&amp;'));
    assert('SEC-03 safeUrl preserves http/https', S.safeUrl('https://x.test/a').startsWith('https://'));
    assert('SEC-03 clampPercent passes valid numbers', S.clampPercent(50) === 50 && S.clampPercent('80') === 80);
    assert('SEC-03 clampPercent clamps out-of-range', S.clampPercent(150) === 100 && S.clampPercent(-10) === 0);
    assert('SEC-03 clampPercent neutralizes CSS injection in width%', S.clampPercent('50%; background:url(evil)') === 0);
  }

  // ── DATA-02: single canonical session shape + shared expiry rule ──────────────
  {
    const { sandbox } = loadPlatform({ scripts: ['js/sanitizer.js', 'js/api.js', 'js/state.js'] });
    const State = sandbox.window.State;
    // Officer-switcher selection → canonical shape, not authenticated.
    const sel = State.setActiveUser({ id: 'sirajo@x', name: 'Dr Sirajo', role: 'Director (EGI)', dsu: 'EGI', email: 'sirajo@x' });
    assert('DATA-02 switcher selection normalized to canonical shape', sel && sel.id === 'sirajo@x' && sel.authenticated === false && sel.roleCode === 'DIR');
    assert('DATA-02 active user persisted + re-read identically', State.getActiveUser().name === 'Dr Sirajo');
    // OTP-style authenticated session shares the SAME shape, with expiry honored.
    State.setActiveUser({ id: 'dg@x', name: 'DG', role: 'Director General', email: 'dg@x', authenticated: true, expiresAt: new Date(Date.now() + 60000).toISOString() });
    assert('DATA-02 authenticated session carries authenticated=true + roleCode DG', State.getActiveUser().authenticated === true && State.getActiveUser().roleCode === 'DG');
    // Expired authenticated session is dropped by the shared rule.
    State.setActiveUser({ id: 'old@x', name: 'Old', role: 'Director', email: 'old@x', authenticated: true, expiresAt: new Date(Date.now() - 1000).toISOString() });
    assert('DATA-02 expired session dropped on read', State.getActiveUser() === null);
  }

  // ── DATA-03: telemetry log() must never throw on storage quota/disabled ───────
  {
    const { sandbox, ls } = loadPlatform({ scripts: ['js/sanitizer.js', 'js/api.js', 'js/telemetry.js'] });
    const T = sandbox.window.Telemetry;
    ls.__setThrow(true);
    let threw = false;
    try { T.log('unit_probe', { x: 1 }); } catch { threw = true; }
    assert('DATA-03 telemetry.log() does not throw on storage failure', !threw);
    ls.__setThrow(false);
  }

  // ── REL-02: telemetry sink no-ops until E18 provisioned, then ships ───────────
  {
    let posted = null;
    const { sandbox, ls } = loadPlatform({
      scripts: ['js/sanitizer.js', 'js/api.js', 'js/telemetry.js'],
      fetchImpl: async (url, opts) => { posted = { url, opts }; return { ok: true, json: async () => ({}) }; }
    });
    const T = sandbox.window.Telemetry;
    T.log('probe_unprovisioned');
    await T.flush(true);
    assert('REL-02 telemetry sink is a no-op until E18 is provisioned', posted === null);
    ls.setItem('dgo_endpoint_E18', 'https://diag.test/ingest');
    await T.flush(true);
    assert('REL-02 telemetry ships to the provisioned E18 sink', !!(posted && posted.url === 'https://diag.test/ingest'));
    assert('REL-02 telemetry ship is tagged Platform-Telemetry', !!(posted && posted.opts.headers['X-DGO-Trigger'] === 'Platform-Telemetry'));
  }

  console.log(`\n${failures ? 'UNIT FAILED (' + failures + ')' : 'UNIT PASSED'} `);
  process.exit(failures ? 1 : 0);
})();
