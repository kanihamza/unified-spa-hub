// Compliance lint — automates the BRD §13 governance controls so prohibited
// patterns cannot regress into the platform. Pure Node, no dependencies.
// Run:  npm run lint   (or: node test/compliance-lint.mjs)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
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

// 2b. No build-tool config files and no runtime dependencies (no build step; vanilla only).
const bannedConfigs = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.cjs',
  'webpack.config.js', 'rollup.config.js', 'rollup.config.mjs', 'babel.config.js', '.babelrc'];
for (const name of bannedConfigs) {
  if (existsSync(path.join(ROOT, name))) fail('BUILD_CONFIG', `${name} present (no bundler/build step allowed)`);
}
for (const f of readdirSync(ROOT)) {
  if (/^tsconfig.*\.json$/.test(f)) fail('BUILD_CONFIG', `${f} present (TypeScript build config not allowed)`);
}
try {
  const pkg2 = JSON.parse(read(path.join(ROOT, 'package.json')));
  if (pkg2.dependencies && Object.keys(pkg2.dependencies).length) {
    fail('RUNTIME_DEP', `package.json declares runtime dependencies: ${Object.keys(pkg2.dependencies).join(', ')}`);
  }
} catch { /* handled above */ }

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

// 8. No page may reach into another module's PRIVATE storage key (STR-03). Pages must
//    use the owning module's public API (Outbox.clearQueue / Lookups.clearCache / API.*).
const PRIVATE_KEYS = /localStorage\.(?:get|set|remove)Item\(\s*['"`](dgo_sync_outbox|dgo_outbox_deadletter|dgo_cached_lookups|dgo_cache_[a-z0-9_]*)/i;
for (const f of htmlFiles) {
  const m = read(f).match(PRIVATE_KEYS);
  if (m) fail('PRIVATE_KEY_IN_HTML', `${rel(f)} accesses private storage key "${m[1]}" (use the owning module's public API)`);
}

// 9. Output-encoding is centralized (STR-01). No module other than sanitizer.js may
//    re-implement an HTML escaper (a function or an inline &<>"' replace map).
for (const f of jsFiles) {
  if (path.basename(f) === 'sanitizer.js') continue;
  const s = read(f);
  if (/function\s+escapeHtml\s*\(/.test(s) || /escapeHtml\s*=\s*function/.test(s)) fail('LOCAL_ESCAPER', `${rel(f)} re-implements escapeHtml (use Sanitizer.escapeHtml)`);
  if (/\.replace\(\s*\/\[&<>/.test(s)) fail('LOCAL_ESCAPER', `${rel(f)} inlines an HTML-escape replace map (use Sanitizer.escapeHtml)`);
}

// 10. Endpoint registry must not drift from its documentation (GOV-01 / INT-02). Every
//     flow code present in BOTH js/api.js and docs/ENDPOINT_MAP.md must share a workflow GUID.
try {
  const apiSrc = read(path.join(ROOT, 'js', 'api.js'));
  const codeGuids = {};
  for (const m of apiSrc.matchAll(/\b(E\d{2}):\s*paUrl\(\s*['"]([0-9a-f]{8})/g)) codeGuids[m[1]] = m[2];
  const mapPath = path.join(ROOT, 'docs', 'ENDPOINT_MAP.md');
  if (existsSync(mapPath)) {
    for (const line of read(mapPath).split('\n')) {
      const codeM = line.match(/^\|\s*(E\d{2})\s*\|/);
      if (!codeM) continue;
      const guidM = line.match(/`([0-9a-f]{8})(?:…|\.\.\.)/); // first truncated GUID cell on the row
      if (!guidM) continue;
      const code = codeM[1], mapGuid = guidM[1];
      if (codeGuids[code] && codeGuids[code] !== mapGuid) {
        fail('ENDPOINT_MAP_DRIFT', `${code}: api.js=${codeGuids[code]} but ENDPOINT_MAP.md=${mapGuid}`);
      }
    }
  }
} catch (e) { fail('ENDPOINT_MAP_DRIFT', `parity check failed: ${e.message}`); }

// 11. SEC-03: no inline event handlers anywhere (HTML static or JS-generated markup).
//     Use data-act + the central dispatcher so script-src can stay 'self'.
const INLINE_HANDLER = /\son(click|change|submit|input|keyup|keydown|dblclick|mouseover|mouseout|mouseenter|mouseleave|focus|blur)\s*=\s*["']/i;
for (const f of [...htmlFiles, ...jsFiles]) {
  const m = read(f).match(INLINE_HANDLER);
  if (m) fail('INLINE_HANDLER', `${rel(f)} has an inline "${m[0].trim()}" handler (use data-act)`);
}

// 12. SEC-03: every page must externalize scripts — no inline <script> blocks.
for (const f of htmlFiles) {
  if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(read(f))) fail('INLINE_SCRIPT', `${rel(f)} has an inline <script> block (externalize to js/pages/*.js)`);
}

// 13. SEC-03: CSP script-src must NOT allow 'unsafe-inline' (else the CSP is not a real
//     control). connect-src must not be the 'https:' wildcard.
for (const f of htmlFiles) {
  const csp = (read(f).match(/Content-Security-Policy["']\s+content=["']([^"]*)["']/i) || [])[1] || '';
  const scriptSrc = (csp.match(/script-src([^;]*)/i) || [])[1] || '';
  if (/unsafe-inline/.test(scriptSrc)) fail('CSP_UNSAFE_INLINE_SCRIPT', `${rel(f)} CSP script-src allows 'unsafe-inline'`);
  if (/connect-src[^;]*\shttps:(\s|;|$)/i.test(csp)) fail('CSP_CONNECT_WILDCARD', `${rel(f)} CSP connect-src uses the bare 'https:' wildcard`);
}

if (failures.length) {
  console.error(`\nCompliance lint FAILED (${failures.length}):`);
  for (const x of failures) console.error('  ✗ ' + x);
  process.exit(1);
}
console.log(`Compliance lint PASSED — ${htmlFiles.length} HTML, ${jsFiles.length} JS checked.`);
