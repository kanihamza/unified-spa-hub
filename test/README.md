# Smoke test (real browser)

`test/smoke.mjs` drives the platform in a real headless Chromium (Playwright) to validate
behaviour that jsdom cannot — real navigation, redirects, and rendering.

Playwright is **not** a runtime/shipped dependency (the platform stays dependency-free). It is a
**test-only** tool you install on demand:

```bash
npm i -D playwright          # one-time, into node_modules (gitignored)
npx playwright install chromium
npm run smoke                # serves the project + runs the checks
```

## What it checks
- **Navigation** does not snap back to the home dashboard when selecting a nav item from a
  module page (OTP-gateway regression guard).
- **Data** populates across modules in demo mode (`?demo=1`).
- The redesigned `dgceo-tracker` loads inside the unified shell.
- No console/page errors (also catches any external-resource/CDN regressions).

Exit code is non-zero if any check fails.
