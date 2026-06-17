# STR-02 — Design-Token Migration (review branch)

**Branch:** `claude/str02-design-token-migration` (forked from the remediated
`claude/serene-davinci-nuhn0p`). **Purpose:** close the audit STR-02 finding — legacy
module CSS defined its own palettes/`body` rules instead of the central design tokens
(`css/dgo-tokens.css`), so theme/density/HC switching never reached those modules and the
brand palette was duplicated across files (NFR-005, FR-024).

## How to review visually
```
npm run serve         # http://localhost:3000
```
Open each migrated page and toggle **Theme** (Light / Dark / High-Contrast) and **Density**
on the **Settings** page — the migrated modules should now follow the theme.

| Page | Module CSS | What to check |
|------|------------|---------------|
| `exec-hub.html` | `exec-hub.css` | **Biggest change.** Was hardcoded dark; now theme-aware (light by default, dark on toggle). Verify contrast of header/sidebar/cards/buttons in all three themes. |
| `fast-track.html` | `fast-track.css` | Brand header/ribbon/tabs unchanged in light; verify dark/HC. |
| `dgceo-hub.html` | `dgceo-hub.css` | Gradient header + page background; light should look identical. |
| `response-tracking.html` | `response-tracking.css` | Navbar gradient, table header, buttons; light identical. |
| `response-matrix.html` | `response-matrix.css` | `.nitda-gradient` header; minute-sheet cream preserved. |

## What changed
**1. New brand tokens in `css/dgo-tokens.css` (additive — no existing token changed):**
- `--dgo-teal-300..700` (NITDA teal; `--dgo-teal-500 = #00A69D` exact) and
  `--dgo-gold-400 (#FFB400)`, `--dgo-gold-500 (#C9A227)`.
- Semantic: `--dgo-color-brand-teal`, `--dgo-color-brand-teal-hover`, `--dgo-color-brand-gold`.

**2. Brand palette is now single-sourced** — every module references the tokens below
instead of its own hex. **The values are exact**, so the *default light theme is visually
unchanged*; only dark/HC now resolve correctly.

| Legacy hex | Token | Exact? |
|-----------|-------|--------|
| `#05583B` (NITDA green) | `--dgo-color-action-primary` (`--dgo-green-700`) | ✅ exact |
| `#044530` (green hover) | `--dgo-color-action-primary-hover` (`--dgo-green-800 #033F2A`) | ~ (1 shade darker) |
| `#00A69D` (NITDA teal) | `--dgo-color-brand-teal` | ✅ exact |
| `#00897F` (teal hover) | `--dgo-color-brand-teal-hover` | ✅ exact |
| `#c9a227` (registry gold) | `--dgo-color-brand-gold` | ✅ exact |

**3. `:root` palette aliasing** (`exec-hub.css`, `fast-track.css`): the modules' local
variables (`--bg`, `--card`, `--brand-primary`, …) now alias dgo semantic tokens, so the
whole module themes from a single block. `exec-hub`'s previously-hardcoded `--accent` sky-blue
becomes the design-system accent (smart-green) — intentional, since the system has no blue.

**4. Page frame** (`dgceo-hub`, `response-tracking`): `body` background/color now use surface/fg
tokens instead of literal greys.

## Intentionally left as literals (not brand drift — review-only)
- Decorative tints: fast-track app-bg gradient (`#00814D`), email-card tint (`#E6F7F9`),
  hover tints (`#F0FDF4`), `not-started` (`#FAFAFA`).
- `response-matrix` minute-sheet cream (`--paper-bg #fffdf0`) and registry "ink" colours
  (`#b91c1c` red-ink, `#1e3a8a` blue-ink) — domain aesthetic.
- Pastel status badges (`#dcfce7/#166534`, etc.) and priority accents (`#ef4444/#f59e0b`).
  These are light-theme-correct; mapping them to status tokens is a possible follow-up but was
  left to avoid unverified colour shifts.

## Residual / follow-up
- **Generic neutrals** (white cards, `#333` text, `#e0e0e0` borders) in the literal-driven
  modules (`dgceo-hub`, `response-tracking`) are still literals, so in **dark** theme those
  cards stay light. Light/HC are fine. Completing these needs the visual QA this branch is for.
- **`response-matrix` Tailwind utility classes** in the HTML still depend on
  `css/tailwind-shims.css` (separate from tokens) — not addressed here.

## Safety
- No JS changed. Brand tokens are additive. `npm run lint` and the Playwright smoke
  (`npm run smoke`) both pass; CSS brace balance verified per file.
