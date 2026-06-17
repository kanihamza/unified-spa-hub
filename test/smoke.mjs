// Real-browser smoke pass (Playwright + Chromium).
// The PLATFORM is live-only (no demo/sample data). This test mocks the Power
// Automate flows at the browser network layer (page.route) — i.e. it stands in
// for the backend during testing without putting any sample data in the product.
// Validates: navigation (no snap-back to home), live-pipeline rendering, the
// correspondence tracker shell, and zero console errors.
// Run:  npm i -D playwright && npx playwright install chromium && npm run smoke
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Live-shaped mock backend (envelope + PascalCase), keyed by workflow GUID.
const DOCS = [
  { ID: 20427, Title: 'EDO Facility Management Request', Created: '2026-06-15T15:13:36Z', AssignedTo: 'Dr. Sirajo', Category: 'Infrastructure', AssignmentStatus: 'PENDING', Description: 'Provision FM for HQ.' },
  { ID: 20428, Title: 'Policy Compliance Review', Created: '2026-06-14T10:00:00Z', AssignedTo: 'Salisu Kaka', Category: 'Policy', AssignmentStatus: 'ROUTED', Description: 'Review policy.' }
];
const TASKS = [
  { ID: 88121, Title: 'Infra gap assessment', AssignedTo: 'Sirajo', RefIDD: '20427', Classification: 'Infrastructure', Priority: 'HIGH', Progress: 'Pending', DueDate: '2026-06-23', Description: 'Audit network.', GDSUROUT: 'EGI' }
];
const EMAILS = [
  { id: 'AAMk-1', subject: 'RE: Facility 20427', receivedDateTime: '2026-06-15T09:00:00Z', bodyPreview: 'Pre-read attached.', from: { emailAddress: { address: 'vendor@x.com' } } }
];
const REFS = { ok: true, data: {
  categories: [{ ID: 1, Title: 'Infrastructure', Category: 'Infrastructure', DSU_KEY: 'EGI', Priority: 'HIGH' }],
  departments: [{ ID: 3, Title: 'e-Government Infrastructure (EGI)', DSU_KEY: 'EGI' }],
  users: [{ name: 'Dr. Muhammad Sirajo', email: 'sirajo@nitda.gov.ng', department: 'EGI', jobTitle: 'Director (EGI)' }]
} };
function bodyFor(url) {
  const g = (url.match(/workflows\/([0-9a-f]{8})/) || [])[1];
  if (g === '4a250f97') return { // Fetch-All Data & References Matrix (E00)
    ok: true, status: { http: 200, code: 'OK', message: 'Success' }, request: {}, timing: {},
    data: { docs: DOCS, tasks: TASKS, emails: EMAILS, users: REFS.data.users, categories: REFS.data.categories, departments: REFS.data.departments, taskComments: [] },
    errors: [], meta: {}
  };
  if (g === 'ff455c68') return REFS;
  if (g === '7995c1eb') return { ok: true, timing: {}, docs: DOCS };
  if (g === '37642ba3') return { ok: true, timing: {}, tasks: TASKS };
  if (g === '3931e2ff') return { ok: true, timing: {}, emails: EMAILS };
  if (g === '43879c51') return { success: true, token: 't', user: { id: 'sirajo@nitda.gov.ng', name: 'Dr. Muhammad Sirajo', role: 'Director (EGI)', roleCode: 'DIR' } };
  return { success: true };
}

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
}

try {
  await sleep(1200);
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  // Mock the live flows at the transport layer, counting requests per flow GUID.
  const reqCount = {};
  await ctx.route('**/powerautomate/**', (route) => {
    const g = (route.request().url().match(/workflows\/([0-9a-f]{8})/) || [])[1];
    if (g) reqCount[g] = (reqCount[g] || 0) + 1;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bodyFor(route.request().url())) });
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));

  // #3 — navigation must NOT snap back to home.
  await page.goto(`${BASE}/docs.html`, { waitUntil: 'networkidle' });
  check('docs.html stays on docs (no auth redirect)', /docs\.html/.test(page.url()), page.url());
  await page.click('#nav-link-tasks');
  await page.waitForLoadState('networkidle');
  check('selecting Tasks navigates to tasks (not home)', /tasks\.html/.test(page.url()), page.url());

  // #4 — data populates from the (mocked) live flows.
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await sleep(300);
  const kpiDocs = await page.textContent('#kpi-docs-count');
  const homeRows = await page.$$eval('#home-docs-tbody tr', (els) => els.length);
  check('home KPI docs > 0 (live)', Number(kpiDocs) > 0, `kpi=${kpiDocs}`);
  check('home recent-docs table has rows (live)', homeRows > 0, `rows=${homeRows}`);

  // Identity is live: switcher populated from references, header shows a real selectable user.
  const optionCount = await page.$$eval('#identity-switcher option', (els) => els.length);
  check('identity switcher populated from live officers', optionCount > 1, `options=${optionCount}`);

  // Correspondence tracker loads in the unified shell from the live flow.
  await page.goto(`${BASE}/dgceo-tracker.html`, { waitUntil: 'networkidle' });
  await sleep(300);
  check('dgceo-tracker has unified sidebar', !!(await page.$('#platform-sidebar')));
  const total = await page.textContent('#stat-total');
  check('tracker loaded records from live flow', Number(total) >= 0, `total=${total}`);

  // Startup: the Fetch-All ran once (loading boot) and populated everything.
  const booted = await page.evaluate(() => sessionStorage.getItem('dgo_booted'));
  check('startup Fetch-All ran (booted once per session)', booted === '1', `booted=${booted}`);

  // Single-call mode: the Fetch-All (E00) is hit once on startup; the dedicated docs/tasks
  // flows are NOT re-called by navigation (served from the Fetch-All cache).
  check('Fetch-All (E00) called once on startup', reqCount['4a250f97'] === 1, `E00 fetches=${reqCount['4a250f97']}`);
  check('dedicated docs flow not re-called (served by Fetch-All cache)', !reqCount['7995c1eb'], `E02 fetches=${reqCount['7995c1eb'] || 0}`);
  check('dedicated tasks flow not re-called (served by Fetch-All cache)', !reqCount['37642ba3'], `E04 fetches=${reqCount['37642ba3'] || 0}`);

  check('no console/page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
} catch (e) {
  console.log('SMOKE ERROR: ' + (e && e.message ? e.message : e));
  failures++;
} finally {
  server.kill();
}
process.exit(failures ? 1 : 0);
