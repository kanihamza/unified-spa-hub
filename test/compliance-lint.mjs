// Compliance lint — automates the BRD §13 governance controls so prohibited
// patterns cannot regress into the platform. Pure Node, no dependencies.
// Run:  npm run lint   (or: node test/compliance-lint.mjs)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (rule, detail) => failures.push(`${rule}: ${detail}`);

function walk(dir, exts, skip = new Set(['.git', 'node_modules', 'test', '.github'])) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, exts, skip));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p);
const htmlFiles = walk(ROOT, ['.html']);
const jsFiles = walk(ROOT, ['.js']);
const read = (p) => readFileSync(p, 'utf8');

// 1. No root-absolute script paths (DEP-01) — breaks non-root hosting.
for (const f of htmlFiles) {
  if (/<script[^>]*src="\/js\//.test(read(f))) fail('ABS_SCRIPT_PATH', `${rel(f)} uses src="/js/..." (must be relative)`);
}

// 2. No prohibited frameworks/build tooling (FR-009/010, AC-003).
try {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const bad of ['react', 'react-dom', 'vite', '@vitejs/plugin-react', '@tailwindcss/vite']) {
    if (deps[bad]) fail('PROHIBITED_DEP', `package.json declares "${bad}"`);
  }
} catch (e) { fail('PKG_JSON', `cannot read/parse package.json: ${e.message}`); }
for (const f of walk(ROOT, ['.tsx', '.jsx'])) fail('JSX_FILE', `${rel(f)} (React/JSX source not allowed)`);
for (const f of jsFiles) {
  if (/\bfrom\s+['"]react['"]|\bReact\.createElement|createRoot\s*\(/.test(read(f))) fail('REACT_USAGE', `${rel(f)} references React`);
}

// 3. Flow endpoints must live ONLY in js/api.js (FR-016/017/024).
for (const f of jsFiles) {
  if (path.basename(f) === 'api.js') continue;
  const s = read(f);
  if (/powerplatform|logic\.azure\.com|\bsig=|paUrl\s*\(/.test(s)) fail('ENDPOINT_OUTSIDE_API', `${rel(f)} defines/uses a flow endpoint outside api.js`);
}

// 4. No iframe sandbox that enables scripts (SEC-03 regression guard).
for (const f of [...htmlFiles, ...jsFiles]) {
  if (/sandbox\s*=\s*["'][^"']*allow-scripts/.test(read(f))) fail('IFRAME_ALLOW_SCRIPTS', `${rel(f)} uses sandbox allow-scripts`);
}

// 5. No hardcoded identities in module JS (DATA-01 / FR-034).
for (const f of jsFiles) {
  const m = read(f).match(/['"][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"]/i);
  if (m) fail('HARDCODED_EMAIL', `${rel(f)} contains a hardcoded email literal ${m[0]}`);
}

// 6. No demo/simulation scaffolding symbols (FR-031–034 / GOV-01).
for (const f of jsFiles) {
  const s = read(f);
  for (const sym of ['getMockResponse', 'getSimulation', 'DEFAULT_USER', 'SAMPLE_DATA']) {
    if (s.includes(sym)) fail('DEMO_SCAFFOLD', `${rel(f)} references "${sym}"`);
  }
}

// 7. Positive check: every page ships a Content-Security-Policy meta (OBS-01).
for (const f of htmlFiles) {
  if (!/http-equiv=["']Content-Security-Policy["']/i.test(read(f))) fail('MISSING_CSP', `${rel(f)} has no CSP meta`);
}

if (failures.length) {
  console.error(`\nCompliance lint FAILED (${failures.length}):`);
  for (const x of failures) console.error('  ✗ ' + x);
  process.exit(1);
}
console.log(`Compliance lint PASSED — ${htmlFiles.length} HTML, ${jsFiles.length} JS checked.`);
