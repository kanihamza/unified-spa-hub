# Smoke test (real browser)

`test/smoke.mjs` drives the platform in a real headless Chromium (Playwright) to validate
behaviour that jsdom cannot — real navigation, redirects, and rendering.

The platform itself is **live-only** (no demo/sample data). This test mocks the Power Automate
flows at the **browser network layer** (`page.route`) so it can validate the live data pipeline
end-to-end without a live backend and **without any sample data in the product**.

Playwright is **not** a runtime/shipped dependency. Install it on demand:

```bash
npm i -D playwright          # one-time, into node_modules (gitignored)
npx playwright install chromium
npm run smoke
```

## What it checks
- Navigation does not snap back to the home dashboard when selecting a nav item.
- Data populates across modules from the (mocked) live flows.
- Identity is live: the switcher is populated from the references flow (no hardcoded users).
- The `dgceo-tracker` loads inside the unified shell from its live flow.
- No console/page errors.

Exit code is non-zero if any check fails.
