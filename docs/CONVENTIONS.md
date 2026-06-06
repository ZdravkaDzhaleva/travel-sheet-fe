# Travel Sheet App — Conventions

> Companion to `ARCHITECTURE.md` and `TASKS.md`. These are the project-specific, enforceable rules. When a rule here conflicts with a general habit, this file wins. Keep it short; if a rule isn't being followed, fix the rule or the tooling, not just the code.

## 1. The one rule that matters most: domain purity
- `domain/` imports **nothing** from Angular, Firebase, Google, or any I/O library. No `@angular/*`, no `firebase/*`, no `HttpClient`, no `fetch`. Only other `domain/` modules and standard TS.
- All I/O happens in `infrastructure/` and `application/`. Services fetch data, convert it to plain domain types, call pure domain functions, and write results back.
- Domain functions are **pure**: same input → same output, no side effects, no `Date.now()`/`Math.random()` inside them. If a function needs "today" or a holiday list, it's passed in as an argument.
- Enforced: an ESLint `no-restricted-imports` rule bans Angular/Google/Firebase imports inside `domain/`. A violation fails CI.

## 2. Naming & file layout
- Infrastructure data-access classes are `*.store.ts` (e.g. `sheets.store.ts`) — never "repository".
- Application orchestrators are `*.service.ts`.
- Angular components/features use kebab-case folders and the standard `*.component.ts|html|scss` triplet.
- Domain files are noun- or verb-named by role: `working-day-calendar.ts`, `trip-generator.ts`, `fuel-balance.ts`, `route-distance.ts`, `row-mapper.ts`.
- Types/interfaces in `domain/entities/` are PascalCase, one concept per file or grouped in a small barrel; no `I`-prefix on interfaces.
- Config lives only in `core/config/`; nothing else hardcodes sheet names, cell coordinates, scopes, or magic numbers.

## 3. TypeScript
- `strict` on. No `any` — use `unknown` + narrowing, or a real type. An `any` that can't be avoided needs an inline `// eslint-disable` with a one-line reason.
- No non-null `!` assertions in domain code; handle the absent case explicitly.
- Prefer `readonly` fields and `as const` for fixed tables (e.g. the workbook cell map).
- Public functions get explicit return types.

## 4. Numbers, money, units (domain-critical)
- All fuel/distance math uses plain `number`, rounded with a single shared helper `round2(n)` = round to 2 decimals. Never hand-roll rounding inline.
- Liters and kilometers: 2 decimals. Consumption rate (`avg`) is stored as given (e.g. `12.0`).
- Currency values from invoices are carried as-is for display; no FX, no recomputation.
- Comparisons against the balance window use the config constants `BALANCE_MIN`/`BALANCE_MAX` — never literal `0`/`8` in code.

## 4a. Dates & timezone (domain-critical)
The app runs in Bulgaria (EET/EEST = UTC+2/+3). Dates are calendar dates, not instants — getting this wrong shifts a day across the timezone boundary and silently corrupts working-day calendars, invoice dates, and month boundaries (often only failing in summer or only in winter).
- **Never use `toISOString()` to derive a calendar date string.** It converts to UTC and can roll the date back a day. For a `YYYY-MM-DD` string, build it from **local** parts: `getFullYear()` / `getMonth()+1` / `getDate()`, zero-padded. This applies to production code AND test helpers (the bug that bit T2.1 was in a test's `isoDate` helper).
- Treat domain dates as timezone-agnostic calendar dates (year/month/day). Don't attach times; don't round-trip through UTC.
- When parsing the Nager.Date `YYYY-MM-DD` strings, construct local dates (e.g. `new Date(y, m-1, d)`), not `new Date("YYYY-MM-DD")` (the latter parses as UTC midnight).
- Month boundaries (first/last working day, period string in D7) are computed in local terms.
- Tests asserting on dates compare local `YYYY-MM-DD` strings via the shared helper, never raw `Date` objects or ISO strings.

## 5. Cyrillic template strings
- Every Bulgarian string written into the workbook (`П Ъ Т Е Н   Л И С Т`, `Начално количество`, `Зареждане гориво …`, `Крайно количество`, `Общо количество`, column headers, `Водач`/`Одобрил`) is a named constant in `core/config/workbook.template.ts`. No Cyrillic string literals scattered in logic.
- The fuel-row sentence is built by one formatter function with a single template; tests assert it byte-for-byte (see §7).
- Source files are UTF-8; do not escape Cyrillic as `\uXXXX`.

## 6. Errors
- Domain failures are typed error classes in `domain/` (e.g. `InfeasibleMonthError`, `MissingRouteLegError`) — never bare `throw new Error('...')` for expected conditions.
- Infrastructure wraps external failures (Sheets/Drive/holiday API) in typed errors at the boundary; raw HTTP errors don't leak into application/domain layers.
- The UI maps known typed errors to friendly messages; unknown errors surface a generic message and are logged.
- Never swallow an error silently. The holiday-API fallback (§7a) logs a warning when it triggers.

## 7. Testing
- Test runner: **Vitest**. Angular v21 generated via the Angular CLI (T0.1) ships with Vitest as the default runner — use it; don't reintroduce Karma/Jasmine or mix runners.
- **Pure domain (priority):** unit-tested with fixtures from `test-fixtures/` (T0.5). No mocks of Google needed.
- **Non-deterministic generator:** assert **invariants**, not exact rows (closing balance ∈ [BALANCE_MIN, BALANCE_MAX], balance never < 0, one row per working day, routes well-formed, totals reconcile, fuel rows exact). See ARCHITECTURE §8.
- **RowMapper / formatters:** deterministic → assert **exact** cells and exact strings.
- **HolidayProvider:** test sanitization explicitly (malformed/oversized/non-HTTPS/garbage payloads, timeout → fallback).
- A task is not "done" until its `Done when` criteria are covered by tests or a documented manual check.

## 8. UI color scheme (Latitude Realize brand)

The app uses the company website palette (latituderealize.com). Define these once as CSS custom properties in `styles.scss` `:root`; never hardcode hex values in components.

```scss
:root {
  /* Brand core */
  --lr-dark:        rgb(57, 57, 57);    /* primary background (dark) */
  --lr-on-dark:     rgb(255, 255, 255); /* text on dark */
  --lr-gold:        rgb(173, 148, 108); /* brand accent (solid fills) */
  --lr-on-light:    rgb(57, 57, 57);    /* text on light surfaces */
  --lr-light:       rgb(255, 255, 255); /* light surface / card background */

  /* Gold gradient — sampled from the logo, for the wordmark/accents only */
  --lr-gold-deep:   rgb(155, 132, 100);
  --lr-gold-bright: rgb(244, 214, 116);
  --lr-gold-gradient: linear-gradient(135deg,
      var(--lr-gold-deep) 0%, var(--lr-gold) 45%, var(--lr-gold-bright) 100%);

  /* Semantic tokens — components reference THESE, not the raw brand vars */
  --app-bg:            var(--lr-dark);
  --app-surface:       var(--lr-light);
  --app-text:          var(--lr-on-dark);
  --app-text-on-surface: var(--lr-on-light);
  --app-accent:        var(--lr-gold);
  --app-accent-text:   var(--lr-on-light);   /* text/icons placed ON gold */
}
```

Rules:
- Components use the **semantic** tokens (`--app-*`), not the raw brand tokens, so theming stays centralized.
- The gold **gradient** is reserved for the logo/wordmark and small accents; use the **solid** `--lr-gold` for buttons, borders, and fills.
- **Accessibility caveat (must respect):** white text on `--lr-gold` (#AD946C) is **below WCAG AA** for normal text (~2.0:1). So:
  - Text/icons sitting on a gold fill use **dark** text (`--app-accent-text` = #393939), not white.
  - Gold text/elements on the dark background are decorative or large only; never use gold for small body text on dark.
  - Body text is white on dark, or #393939 on light — both pass AA.
- Keep the dark base as the app shell; use light surfaces (cards/tables) for dense data like the invoice list and generation results, with #393939 text.

## 8a. Responsive & mobile-friendly UI

The app must be fully usable from a mobile browser (the user generates and reviews sheets on the go). Design **mobile-first**, then layer on wider-viewport refinements — not the other way round.

- **Viewport:** `index.html` ships with `<meta name="viewport" content="width=device-width, initial-scale=1">`. Do not set `user-scalable=no` or `maximum-scale=1` — pinch-zoom must remain available for accessibility.
- **Breakpoint baseline:** styles target a 360 px-wide viewport as the floor. Use `min-width` media queries to enhance at larger sizes; never write desktop-first `max-width` rules that retro-shrink on mobile. Suggested breakpoints: `--bp-sm: 480px`, `--bp-md: 768px`, `--bp-lg: 1024px` (define once as CSS custom properties, reference everywhere).
- **Units:** font sizes and spacing use `rem`/`em` against a 16 px root, not raw `px`. Layout widths use `%`, `min()`, `max()`, `clamp()`, or `fr` units — not fixed widths. Container `max-width` is fine, fixed `width` is not.
- **Layout primitives:** use CSS Grid / Flexbox with `flex-wrap` and `gap`; avoid floats and absolute positioning for page-level layout. No horizontal scrolling on the body — `overflow-x: hidden` is a smell that hides a real bug; fix the bug.
- **Touch targets:** interactive elements (buttons, links, form controls, list-item actions) are at least **44×44 CSS px** with comfortable spacing. Hover-only affordances are forbidden — every action must work on a tap-only device. Provide visible `:focus-visible` states for keyboard users.
- **Forms:** inputs use the right `inputmode`/`type` so mobile keyboards match (`type="number"` for liters/price, `inputmode="decimal"` where appropriate, `type="date"` for invoice dates). File inputs accept camera capture where it makes sense (`accept="image/*,.pdf"`). Labels are always visible — never rely on placeholders as labels.
- **Tables (invoices, generation results):** the invoice list and any data table must degrade gracefully on narrow screens. Either: (a) stack cells into card rows under `--bp-sm`, or (b) wrap the table in an explicitly scrollable container (`overflow-x: auto`, visible scrollbar). Never leak a wide table out of the viewport unannounced.
- **Modals / sheets:** dialogs are full-screen below `--bp-md` (top-and-bottom safe-area insets respected via `env(safe-area-inset-*)`); side drawers fall back to bottom sheets on narrow screens.
- **Verification:** for any UI task, before marking it done you must (1) exercise it in Chrome DevTools' device toolbar at 360×640 *and* 768×1024, and (2) confirm tap targets, no horizontal scroll, and that all forms can be completed with the soft keyboard up. Note this verification in the task entry.
- **Accessibility carry-overs from §8:** the gold-on-white contrast rule still applies — on mobile, dense lists with small gold text fail AA fast. Default to dark text on light surfaces for data.

## 8b. Shared styles vs component styles (no duplication)

Angular scopes a component's SCSS to that component (emulated encapsulation). That's good for genuinely page-specific layout — but it means a primitive copy-pasted into several component SCSS files (a button, a card, a status box) silently diverges and bloats each file. Don't do that.

- **Global, reusable, presentational → `src/styles.scss`.** Design tokens and any visual primitive shared by ≥2 pages live there as unscoped CSS custom properties / utility classes. Rules emitted from `styles.scss` are **not** encapsulated, so they style any component's DOM.
  - **Tokens already defined** (reference these, don't hardcode): colour `--app-*` / `--lr-*` (§8); danger `--app-danger`, `--app-danger-text`, `--app-danger-bg`; radii `--radius-sm|md|lg|pill`; elevation `--shadow-card`, `--shadow-pop`; `--hairline-on-dark`, `--hairline-on-surface`, `--muted-on-surface`.
  - **Primitives already global:** `.card` (light surface); `.btn` (colour-less base) + `.btn--primary` (gold), `.btn--danger` (red), `.btn--ghost` (dark text — for light surfaces), `.btn--ghost-dark` (light text — for the dark shell, incl. the pending `a.btn--ghost-dark:not([href])` state); `.sk-bar` (skeleton shimmer).
- **Page-specific only → the component's SCSS.** Layout and one-off rules that no other page needs (e.g. the invoice table grid, the company-info `.kv` rows). If you find yourself writing the same rule in a second component, promote it to `styles.scss` instead.
- **Behaviour/state → a `shared/ui` component, not a class.** Anything with logic, projected content, focus management, or signals (Modal, Toast, ErrorAlert) is a standalone component under `shared/ui/`. Reserve global CSS for purely presentational primitives.
- **Picking the variant matters:** buttons on the **dark shell** use `--ghost-dark`; buttons on a **light surface** (inside a modal/card) use `--ghost`. Mismatching them produces white-on-white / dark-on-dark — verify the surface before choosing.
- **The style budget is the guardrail.** The `anyComponentStyle` budget in `angular.json` is intentionally tight; if a component SCSS trips it, that's almost always a primitive that should have been global — extract it rather than raising the budget.

## 9. Angular specifics
- Standalone components, no NgModules.
- State via signals; avoid manual `Subscription` management where a signal/`toSignal` works.
- Never bind untrusted/external strings with `[innerHTML]`. Interpolation only (auto-escaped). This applies to holiday-API fields and any sheet-derived text shown in the UI.
- Components stay thin: no business logic in components — delegate to application services.

## 10. Security hygiene
- No secrets in git: Google OAuth client secrets and service-account keys never committed. (Firebase web config is not secret and may be committed.)
- `core/config/workspace.config.ts` ships with placeholder IDs and a "FILL ME" note; real Drive IDs are provided via env/local config, not committed.
- Follow the holiday-API hardening rules (ARCHITECTURE §7a) for any external fetch.

## 11. Lint, format, commits (enforced)
- **ESLint + Prettier, strict, enforced in CI.** A push that fails lint, format-check, or tests does not merge.
- Prettier owns formatting; do not hand-format or fight it. ESLint owns correctness rules (incl. the §1 import ban).
- **Commits = Conventional Commits + task ID.** Format: `<type>(<scope>): <summary> [T<id>]`.
  - Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `build`, `ci`.
  - Examples:
    - `feat(domain): trip generator with fuel-target search [T2.5]`
    - `feat(infra): sheets store read + writeSheet [T3.3]`
    - `test(domain): fuel balance rounding edge cases [T2.3]`
    - `chore(config): generation constants and caps [T0.3]`
- One logical change per commit; keep commits scoped to a task where practical.
