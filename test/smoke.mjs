// Real-browser smoke pass (Playwright + Chromium).
// Serves the project statically, then drives a real browser to validate:
//   #3 navigation does NOT snap back to the home dashboard, and
//   #4 data populates (in demo mode) across modules.
// Run:  npm run smoke      (after: npm i && npx playwright install chromium)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3210;
const BASE = `http://localhost:${PORT}`;

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newPage(browser) {
  return browser.newPage().then(async (page) => {
    page._errors = [];
    page.on('console', (m) => { if (m.type() === 'error') page._errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => page._errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
    return page;
  });
}

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
}

try {
  await sleep(1200);
  const browser = await chromium.launch();
  const page = await newPage(browser);

  // #3 — navigate to a module, then select another nav item; must NOT snap to index.
  await page.goto(`${BASE}/docs.html?demo=1`, { waitUntil: 'networkidle' });
  check('docs.html stays on docs (no auth redirect)', /docs\.html/.test(page.url()), page.url());
  await page.click('#nav-link-tasks');
  await page.waitForLoadState('networkidle');
  check('selecting Tasks navigates to tasks (not home)', /tasks\.html/.test(page.url()), page.url());

  // #4 — data populates in demo mode.
  await page.goto(`${BASE}/index.html?demo=1`, { waitUntil: 'networkidle' });
  const kpiDocs = await page.textContent('#kpi-docs-count');
  const homeRows = await page.$$eval('#home-docs-tbody tr', (els) => els.length);
  check('home KPI docs count > 0 (demo)', Number(kpiDocs) > 0, `kpi=${kpiDocs}`);
  check('home recent-docs table has rows (demo)', homeRows > 0, `rows=${homeRows}`);

  await page.goto(`${BASE}/docs.html?demo=1`, { waitUntil: 'networkidle' });
  const docsRows = await page.$$eval('tbody tr', (els) => els.length);
  check('docs page renders rows (demo)', docsRows > 0, `rows=${docsRows}`);

  // dgceo-tracker redesign loads in the shell.
  await page.goto(`${BASE}/dgceo-tracker.html?demo=1`, { waitUntil: 'networkidle' });
  const hasSidebar = await page.$('#platform-sidebar');
  check('dgceo-tracker has unified sidebar', !!hasSidebar);

  check('no console/page errors', page._errors.length === 0, page._errors.join(' | '));

  await browser.close();
} catch (e) {
  console.log('SMOKE ERROR: ' + (e && e.message ? e.message : e));
  failures++;
} finally {
  server.kill();
}
process.exit(failures ? 1 : 0);
