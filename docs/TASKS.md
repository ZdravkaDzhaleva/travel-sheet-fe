# Travel Sheet App — Tasks

> Companion to `ARCHITECTURE.md`. Build order is top-to-bottom; each task lists its dependencies.
> Conventions: one task per session is fine. When you finish a task, change `[ ]` → `[x]` and add a one-line note under it. Do not start a task whose dependencies are unchecked.
> Section references (§6b, §7a, …) point into `ARCHITECTURE.md`.

## Defaults for the open questions (override here if needed)
- **D1 — Per-day caps:** `MAX_STOPS_PER_DAY = 5`, `MAX_KM_PER_DAY = 110`. (From the 2025 reference.)
- **D2 — SeatCount:** write the value verbatim into the seats cell (so `"4+1"` appears as-is).
- **D3 — Weekly Architect/Constructor visits:** kept as a *soft* preference only; the max tank capacity fuel target wins. The generator may skip them if balancing doesn't need them.


If you change a default, update both this block and `generation.config.ts`.

---

## Phase 0 — Scaffolding & config

### [x] T0.1 — Create the Angular project
Initialize a standalone-components Angular app (latest stable) named `travel-sheet-app`. Routing on, SCSS, strict TS.
- **Deps:** none
- **Done when:** `ng serve` shows the default page; `ng test` runs (zero specs ok); `ng lint` passes.
- Angular 21.2.6 + Vitest (built-in) + @angular-eslint/21.4.0; domain-purity no-restricted-imports rule added; brand CSS tokens in styles.scss.

### [x] T0.2 — Folder skeleton
Create the empty folder structure from ARCHITECTURE §4 (`core/{auth,config,google}`, `domain/{entities,calendar,generation,mapping}`, `infrastructure/`, `application/`, `features/{sign-in,company-info,invoices,generate}`). Add a `.gitkeep` or index barrel per folder.
- **Deps:** T0.1
- **Done when:** structure matches §4; `ng build` still succeeds.
- All 13 folders created with `.gitkeep`; `ng build` passes.

### [x] T0.3 — Config files (no secrets in git)
Create `core/config/`: `workspace.config.ts` (Drive folder name, supporting-sheet name, workbook name — placeholder values + a clear "FILL ME" comment), `supporting.map.ts` (tab names + 0-based column indexes per §6a), `workbook.template.ts` (cell coordinates + number formats + bold rules per §6), `generation.config.ts` (`BALANCE_MIN=0`, `BALANCE_MAX=8`, `MAX_STOPS_PER_DAY=3`, `MAX_KM_PER_DAY=80`), `holiday.config.ts` (Nager endpoint template, timeout ms, override tab name), `oauth.config.ts` (scopes).
- **Deps:** T0.2
- **Done when:** all config compiles and is imported by a trivial smoke spec; no real IDs/secrets committed (use env or placeholder).
- 6 config files + 24-assertion smoke spec; all placeholders, no real IDs; `ng test` and `ng lint` pass.

### [x] T0.4 — Firebase Auth SDK setup
Install the `firebase` package and initialize the app for **Auth only**: put the Firebase web config (apiKey, authDomain, projectId, …) in `environment.ts` / `environment.prod.ts`, call `initializeApp` + `getAuth` at bootstrap. **Note:** the Firebase web config is *not* secret — it ships in the client bundle and is safe to commit (Firebase security comes from Auth rules and authorized domains). The actual secrets to keep out of git are the **Google OAuth client setup** and any **service-account keys** — never commit those. Hosting config (`firebase.json`, `.firebaserc`) is NOT created here — it belongs to deployment (T6.3).
- **Deps:** T0.1
- **Done when:** app boots with Firebase initialized; a manual Google sign-in round-trips a user object (fully exercised later in T3.1). No service-account keys or OAuth client secrets committed.
- `firebase` installed; `environment.ts`/`environment.development.ts` with FILL_ME placeholders; `initializeApp`+`getAuth` in `app.config.ts`; 5-assertion smoke spec passes; no secrets committed.

### [x] T0.5 — Test fixtures
Create `test-fixtures/` with reusable sample data mirroring the real supporting sheet: one Company, the active Vehicle (GLC), the 6 Locations, the 15 RouteLegs, a small set of Invoices/FuelEvents, and a known 2026 holiday list. Export typed factory helpers (e.g. `makeLocations()`, `makeRouteLegs()`) so Phase 2 specs share one source of truth instead of redefining fixtures.
- **Deps:** T1.1 (types) — may be done right after T1.1 if preferred
- **Done when:** fixtures compile and are imported by at least one passing smoke spec; values match `SupportingSpreadsheet.xlsx`.
- `src/test-fixtures/` with 6 factory files + barrel; 29-assertion smoke spec covers all factories; 58 total tests pass.

---

## Phase 1 — Domain entities

### [x] T1.1 — Entity types
In `domain/entities/`, define plain TS interfaces/types (no classes, no decorators): `Company`, `Vehicle`, `Location` (with `LocationType` union), `RouteLeg`, `Invoice`, `FuelEvent`, `Holiday`, `GeneratedRow` (with a `RowKind` = opening|fuel|trip|zero), `MonthSheet`. Mirror §6a fields exactly; `SeatCount: string` (per D2).
- **Deps:** T0.2
- **Done when:** types compile; a spec constructs one of each from literals.
- 9 entity files + barrel index; `entities.spec.ts` constructs all types from literals using `expectTypeOf`; implemented as T0.5 dependency.

---

## Phase 2 — Pure domain (the core; highest test priority)

### [x] T2.1 — WorkingDayCalendar
Pure function `workingDaysInMonth(year, month, holidays: Date[]): Date[]` — all weekdays Mon–Fri in the month minus the supplied holiday dates. No I/O (holidays are passed in).
- **Deps:** T1.1
- **Done when:** unit tests cover a normal month, a month with a mid-week holiday, and a holiday landing on a weekend (no double-removal). 100% of branches.
- `domain/calendar/working-day-calendar.ts` + 13-test spec covering all branches; timezone-safe local-date key; 71 total tests pass.

### [x] T2.2 — RouteDistance
Pure `legDistance(aId, bId, legs): number` (undirected lookup, throws if missing) and `routeDistance(stopIds: number[], legs): number` summing Office→…→Office consecutive legs incl. return.
- **Deps:** T1.1
- **Done when:** tests verify undirected lookup (A→B == B→A), a single-stop round trip = 2× the pair, a multi-stop chain, and a clear error on a missing leg.
- `domain/generation/route-distance.ts` + `missing-route-leg.error.ts`; 15 tests covering undirected lookup, 2× single-stop, multi-stop chain, missing-leg error; 86 total pass.

### [x] T2.3 — FuelBalanceCalculator
Pure helpers: `consumed(km, avg) = round(km*avg/100, 2)`; `applyTrip(balance, km, avg)`; `applyFuel(balance, liters)`. All rounding to 2 decimals; never returns negative without flagging.
- **Deps:** T1.1
- **Done when:** tests match hand-computed values; a sequence (open → fuel → several trips) reproduces a known running balance.
- `domain/generation/round2.ts` (shared rounding helper), `fuel-balance.ts` (`consumed`/`applyFuel`/`applyTrip` with `wentNegative` flag); 17 tests including a 6-step running-balance sequence; lint + 103 tests pass.

### [x] T2.4 — ZeroTripRules
Pure predicate(s) deciding when a working day becomes a zero-trip row, per §6b (no destination needed, target already met, would overconsume, weekly minimums still satisfiable). Pure inputs only.
- **Deps:** T2.3
- **Done when:** tests cover each trigger condition independently.
- `domain/generation/zero-trip-rules.ts` — four predicates (`hasNoDestination`, `targetAlreadyMet`, `wouldOverconsume`, `weeklyMinimumsStillSatisfiable`) + OR-composed `isZeroTripDay`; 20 tests, each trigger fired independently from a no-trigger baseline; 123 total pass.

### [x] T2.5 — TripGenerator (the heart)
Pure `generate({workingDays, fuelEvents, locations, routeLegs, vehicle, openingBalance}): GeneratedRow[]` per §6b. Distribution = "whatever burns the right amount of fuel" toward closing balance ∈ [0,8], never negative, within D1 caps. Emit opening row, fuel rows on their dates (verbatim from metadata), one trip/zero row per working day, ordered; same-day order opening→fuel→trip. On infeasibility, throw a typed `InfeasibleMonthError`.
- **Deps:** T2.1, T2.2, T2.3, T2.4
- **Done when:** invariant tests pass (ARCHITECTURE §8): one row/working day; balance never <0; closing ∈ [0,8]; fuel rows exact; routes well-formed and within caps; totals reconcile. Plus an over-fueled fixture that asserts `InfeasibleMonthError`.
- `domain/generation/trip-generator.ts` (greedy distance allocator aiming for closing = (min+max)/2; merges working-day timeline with fuel-event dates so weekend fuel rows still emit) + `infeasible-month.error.ts`; 18 tests including the full §8 invariant suite on Jan 2026 and the over-fueled InfeasibleMonth case; 141 total pass, lint clean.

### [x] T2.6 — RowMapper
Pure `toSheetCells(rows, company, vehicle, period): CellModel[]` producing the exact §6 layout (A1–A3, A5, D7, rows 9/10/12, data from 13, totals, signatures), with the §6 row-type string patterns and bold rules. Deterministic given its input rows.
- **Deps:** T1.1
- **Done when:** for a fixed `GeneratedRow[]`, asserts exact cell coordinates/values; verifies the `Зареждане гориво …` and `Начално/Крайно/Общо количество` strings byte-for-byte.
- `domain/mapping/cell-model.ts` + `row-mapper.ts`; added `ROW_OPENING_KM_MARK = 'х'` constant to workbook.template.ts; 30 tests covering header region, vehicle/seats, column headers, every row kind (opening/fuel/trip/zero) with exact A1 coords + values + bold + FMT_LITERS pattern, closing/total rows, signatures, determinism. 171 total pass, lint clean.

---

## Phase 3 — Infrastructure (Google + HTTP)

### [x] T3.1 — GoogleAuth
`core/auth`: wrap Firebase Auth (Google sign-in) + GIS token client to obtain an access token with the §oauth scopes. Expose `getAccessToken()` with silent re-consent on expiry.
- **Deps:** T0.3, T0.4
- **Done when:** manual sign-in yields a token that calls a trivial Sheets read; token refresh works after expiry.
- `core/auth/google-auth.ts` (Injectable `GoogleAuth` with `signInWithGoogle/signOut/getAccessToken`), `google-auth.types.ts` (minimal GIS surface + `GoogleAuthError` + `CachedAccessToken`), `token-cache.ts` (pure `buildCachedToken`/`isCachedTokenValid` with 60s safety margin). Added `googleOAuthClientId` placeholder to both env files; gsi/client script in index.html. 11 new tests (cache helpers + smoke). Manual real-OAuth E2E pending real credentials. 182 total pass, lint clean.

### [x] T3.2 — Low-level Google clients
`core/google`: thin typed wrappers over Sheets `values.get`/`values.update`/`batchUpdate` and Drive `files.create`. Inject the access token from T3.1.
- **Deps:** T3.1
- **Done when:** an integration smoke test reads a range from the real supporting sheet.
- `core/google/google-http.ts` (shared `googleFetch<T>` + typed `GoogleApiError`), `sheets.client.ts` (valuesGet/valuesUpdate/batchUpdate, USER_ENTERED on updates), `drive.client.ts` (createFile via multipart upload + exported `buildMultipartBody`). All use `inject(GoogleAuth)` for token. 16 unit tests (URL/method/headers/body assertions + non-2xx error path) via TestBed-stubbed GoogleAuth. Real-sheet smoke is a manual check pending creds. 198 total pass, lint clean.

### [x] T3.3 — SheetsStore
`infrastructure/sheets.store.ts`: read Company/Vehicle/Location/Route/Invoice (map columns via `supporting.map`) into domain entities; `appendInvoice(row)`; `writeSheet(cells, sheetName)`; `readPreviousMonthClosing(year, month, vehicle): number | null` — the single permitted workbook read-back (returns the prior `м_MM` sheet's `Крайно количество` cell if that sheet exists and matches the vehicle plate in its row 9, else `null`). **The annual workbook is pre-created (empty) by the user in the Drive folder under the hardcoded name** — the app does NOT create the workbook. `writeSheet` adds the `м_MM` tab, or clears+rewrites it if it already exists. Read-only on supporting master data; the only writes to supporting are app-managed Invoice rows. Never reads the workbook back except via `readPreviousMonthClosing`.
- **Deps:** T3.2, T1.1
- **Done when:** loads all master data into typed entities; writes a test `м_MM` sheet into the pre-created test workbook matching the template; re-running replaces the sheet cleanly; `readPreviousMonthClosing` returns the correct value when the prior sheet exists/matches and `null` otherwise.
- `infrastructure/sheets.store.ts` (5 loaders, appendInvoice, writeSheet with delete-and-readd, readPreviousMonthClosing with plate check) + `sheets-store.errors.ts` (WorkbookNotFoundError, MasterDataParseError). Lazily resolves workbook ID via Drive folder + name lookup, cached. Extended SheetsClient with `valuesAppend`/`getSpreadsheet` and DriveClient with `findByName`. Added `MONTH_SHEET_PREFIX` + `monthSheetName()` to workbook.template. 28 unit tests; real-workbook integration smoke remains manual. 226 total pass, lint clean.

### [x] T3.4 — DriveStore
`infrastructure/drive.store.ts`: upload an invoice file to the configured Drive folder; return `DriveFileId`.
- **Deps:** T3.2
- **Done when:** a file upload returns a usable file ID visible in Drive.
- `infrastructure/drive.store.ts` (`@Injectable DriveStore.uploadInvoice(blob, name?)` returning `DriveFileId`) + `drive-store.errors.ts` (`DriveFolderNotFoundError`). Lazily resolves DRIVE_FOLDER_NAME via DriveClient.findByName (cached); falls back to `file.name` for File blobs or `"invoice"` otherwise; omits empty mimeType. 8 unit tests; real-Drive upload smoke remains manual. 234 total pass, lint clean.

### [x] T3.5 — HolidayProvider (with §7a hardening)
`infrastructure/holiday.provider.ts`: fetch Nager.Date for `{year}/BG`; apply ALL §7a rules — HTTPS-pinned host, JSON-only, per-entry schema validation (`YYYY-MM-DD`, real date, in-year), payload bound (≤60), timeout + fallback to supporting-sheet override, optional cross-check. Returns `Date[]`.
- **Deps:** T0.3, T1.1
- **Done when:** sanitization unit tests pass for malformed/oversized/non-HTTPS/garbage payloads; timeout triggers the override fallback; happy path returns the correct 2026 BG set.
- `infrastructure/holiday.provider.ts` (`@Injectable HolidayProvider.getHolidays(year)` returns `{dates, source, warnings}`) plus exported pure helpers (`isPinned`, `validateNagerPayload`, `crossCheck`) and a hardcoded 2026 expected set. AbortController timeout, content-type and explicit JSON.parse checks, full validation pipeline (rules 1–6), graceful fallback to `HolidayOverrides!A2:A` and source='none' when override also fails. 24 unit tests covering each §7a rule + cross-check warning + override fallback + double-failure. 258 total pass, lint clean.

---

## Phase 4 — Application services

### [x] T4.1 — MasterDataService
Load Company, the single active Vehicle (`IsActive`), Locations, and RouteLegs via SheetsStore; expose as signals. Error if 0 or >1 active vehicle.
- **Deps:** T3.3
- **Done when:** returns typed master data; tests cover the 0/>1 active-vehicle errors.
- `application/master-data.service.ts` (@Injectable, parallel Promise.all loads + active-vehicle uniqueness validation, exposes `company/vehicle/locations/routeLegs/loading/error` readonly signals + a `ready` computed) + `master-data.errors.ts` (NoCompanyError, NoActiveVehicleError, MultipleActiveVehiclesError with count). 7 tests via TestBed-stubbed SheetsStore. 265 total pass, lint clean.

### [x] T4.2 — CalendarService
Resolve working days for a (year, month): call HolidayProvider, then WorkingDayCalendar. Surface fallback/warnings.
- **Deps:** T3.5, T2.1
- **Done when:** returns the correct working-day list for a sample 2026 month; warning surfaces when the override fallback is used.
- `application/calendar.service.ts` (@Injectable, `workingDaysFor(year, month)` returns `{workingDays, source, warnings}` passing through HolidayProvider's source + warnings). 5 tests covering Jan 2026 = 21 working days, Feb 2026 = 20, override warning surfacing, source='none' with both warnings, and cross-check warning preservation. 270 total pass, lint clean.

### [x] T4.3 — InvoiceService
Upload flow: file → DriveStore → get `DriveFileId` → append metadata row via SheetsStore. List/edit/delete invoice metadata.
- **Deps:** T3.3, T3.4
- **Done when:** an uploaded invoice appears as a Drive file + an Invoice row; list/delete reflect changes.
- `application/invoice.service.ts` (@Injectable, signals `invoices/loading/error` + `load/upload/update/delete`). `upload` allocates `nextId = max(Id)+1`, calls DriveStore first then SheetsStore.appendInvoice (so a failed upload never leaves an orphan row). Extended SheetsStore with `updateInvoice` (locates row by Id and `valuesUpdate`s `Invoice!A{n}:K{n}`) and `deleteInvoice` (cached Invoice-tab sheetId + `deleteDimension`); added `InvoiceNotFoundError`/`InvoiceTabNotFoundError` and a shared `invoiceToRow` helper. 16 new tests (6 SheetsStore + 10 InvoiceService). 286 total pass, lint clean.

### [x] T4.4 — GenerateMonthService
Orchestrate §5 generate step: gather master data + working days + in-scope fuel events, **resolve the opening balance** (via `SheetsStore.readPreviousMonthClosing`; if `null`, fall back to the active `Vehicle.OpeningFuelBalance`), then TripGenerator → RowMapper → SheetsStore.writeSheet. Surface `InfeasibleMonthError` as a user-facing message.
- **Deps:** T4.1, T4.2, T2.5, T2.6, T3.3
- **Done when:** generating a sample month writes a correct sheet end-to-end against a test workbook; the first month of a vehicle uses `OpeningFuelBalance`, a later month carries forward the prior sheet's closing; infeasible month shows a clear error and writes nothing.
- `application/generate-month.service.ts` (@Injectable, `generateMonth(year, month)` returns `GenerateMonthResult` with `sheetName/openingBalance/openingSource ('priorSheet'|'vehicleConfig')/closingBalance/rowCount/holidaySource/warnings`; signals `loading/error/result`). Auto-loads MasterDataService when not `ready()`; filters invoices by VehicleId + InvoiceDate year/month → FuelEvent[]; resolves opening via `readPreviousMonthClosing` (fallback to `Vehicle.OpeningFuelBalance`); pipes through `generate` → `toSheetCells` → `writeSheet`. InfeasibleMonthError propagates and prevents the writeSheet call. 7 tests covering happy path (Jan 2026 with `OpeningFuelBalance`), prior-closing carry-forward, master-data auto-load gating, warning pass-through, invoice filtering (vehicle/month/year), and the InfeasibleMonth no-write path. 293 total pass, lint clean.

---

## Phase 5 — UI features

### [x] T5.1 — Sign-in
`features/sign-in`: Google sign-in button via GoogleAuth; route guard so the rest of the app requires auth.
- **Deps:** T3.1
- **Done when:** unauthenticated users are routed to sign-in; after sign-in they reach the app shell.
- `features/sign-in/sign-in.component.{ts,html,scss}` (standalone, brand tokens, mobile-first per §8a — full-viewport card, ≥44 px touch targets, safe-area insets, focus-visible). `features/home/home.component.{ts,html,scss}` is the placeholder shell to be expanded in T6.1 (signs out via GoogleAuth and routes back to /sign-in). Added `core/auth/auth-state.ts` (@Injectable `AuthState.waitForFirstAuthState()` — one-shot `onAuthStateChanged` so the guard waits for Firebase session rehydrate before deciding) and `core/auth/auth.guard.ts` (functional `CanActivateFn` redirecting to `/sign-in` on no user). Routes: `/sign-in` (lazy), `/home` (lazy + `authGuard`), `''` → `/home`, `**` → `/home`. Stripped Angular scaffold placeholder from `app.html`/`app.ts`/`app.spec.ts`. 6 new tests (2 guard + 4 sign-in component covering success/error/busy/re-entrant). 299 total pass, lint clean. Mobile-viewport verification deferred to T6.1's app-shell pass.

### [x] T5.2 — Company info (read-only)
`features/company-info`: display Company + active Vehicle from MasterDataService. No edit controls. Escape all displayed strings (no `[innerHTML]`).
- **Deps:** T4.1
- **Done when:** shows correct company/vehicle; verified no edit path exists.
- `features/company-info/company-info.component.{ts,html,scss}` (standalone, RouterLink for back nav). Binds MasterDataService signals directly (`company/vehicle/loading/error/ready`) and auto-triggers `load()` on init when not ready and not already loading/errored. Renders Company (Name/EIK/Address/ReportingYear) and the active Vehicle (Name/Reg/Fuel/Seats/Avg/Tank/OpeningFuelBalance) inside `dl/dt/dd` cards — interpolation only, no `[innerHTML]`. Brand-styled per §8; mobile-first per §8a (single-column under 480 px, two-column above, safe-area insets, ≥44 px back-link target, `:focus-visible`). Added `/company-info` lazy guarded route + a back-link from the `/home` placeholder. 8 specs covering auto-load gating (3 branches), loading state, error state, populated fields, no-edit-controls assertion (zero inputs/textareas/selects/buttons/contenteditable), and an XSS sanity check confirming interpolation escapes `<script>`. 307 total pass, lint clean. Mobile-viewport DevTools verification deferred to T6.1.

### [x] T5.3 — Invoices
`features/invoices`: upload form (file + metadata), list, edit, delete via InvoiceService.
- **Deps:** T4.3
- **Done when:** full upload→list→edit→delete cycle works against the real workspace.
- `features/invoices/invoices.component.{ts,html,scss}` (standalone, FormsModule + RouterLink). Single screen with an upload/edit form on top and the invoice list below; rows render as stacked cards under 480 px and as a row layout from 768 px. Auto-loads MasterDataService + InvoiceService on init. Defaults `companyId`/`reportingYear`/`vehicleId` from the active company + vehicle (no manual entry); `currency` defaults to `EUR`. Date IO is timezone-safe per §4a (input parses local `YYYY-MM-DD`; display formats `DD.MM.YYYY`). `Edit` pre-fills the form (file input hidden — DriveFileId is preserved); `Delete` confirms via `window.confirm`. Form blocks submit on missing file / unparseable date / missing required fields and surfaces both local validation errors and InvoiceService errors. Mobile-first per §8a (`type="number"`+`inputmode="decimal"` for amounts, `type="date"`, `accept="image/*,application/pdf,.pdf"` for the file input, ≥44 px targets, `:focus-visible`). Added `/invoices` lazy guarded route + a routerLink from `/home`. 10 specs cover auto-load gating, list render, upload (trim + local-date assertion + company/vehicle defaults + file name), the no-file and bad-date guard paths, edit pre-fill + merged Invoice update + DriveFileId preservation, delete-with-confirm (both branches), and master-data error replaces the form. 322 total pass, lint clean. Mobile-viewport DevTools verification deferred to T6.1.

### [x] T5.4 — Generate
`features/generate`: pick month, trigger GenerateMonthService, show progress + success/error messages (incl. infeasible-month error and holiday-fallback warning).
- **Deps:** T4.4
- **Done when:** a user can generate a month and see the result; errors/warnings render clearly.
- `features/generate/generate.component.{ts,html,scss}` (standalone, FormsModule + RouterLink). Year + month picker defaults to the current calendar period; the Generate button is disabled and labelled "Generating…" while `service.loading()` is true (and re-entrant clicks are ignored). Binds `GenerateMonthService` signals directly (`loading/error/result`) — no local state duplication. Success card shows `sheetName`, period, row count, opening + closing balances, and human-readable labels for `openingSource` ("Carried forward…" vs "Seeded from the active vehicle configuration") and `holidaySource` ("Nager.Date API" / "Supporting-sheet override (API unavailable)" / "No holidays applied (both API and override failed)"). Warnings render in a dedicated yellow-tinted block. Error path branches on `InfeasibleMonthError` (heading "Infeasible month" + plain-language hint about the fuel-balance window) vs generic ("Generation failed"). Mobile-first per §8a — single-column form/result under 480 px, two columns from 480 px, three from 768 px; safe-area insets; ≥44 px button; `:focus-visible`. Added `/generate` lazy guarded route + a routerLink from `/home`. 9 specs cover defaults, submit args, success-card field rendering (both opening-source branches), warnings rendering, InfeasibleMonthError-specific message, generic error rendering, button disabled-while-loading, and the re-entrant guard. 331 total pass, lint clean.

---

## Phase 6 — Integration & polish

### [x] T6.1 — Routing & app shell
Wire routes (sign-in → company-info / invoices / generate), nav, loading/error states.
- **Deps:** T5.1–T5.4
- **Done when:** navigation works; guards enforced.
- `layouts/navbar/navbar.component.{ts,html,scss,spec}` — sticky top nav bar (brand link, Company info / Invoices / Generate links with `routerLinkActive`, Sign out button) wrapping `<router-outlet>`. Routes restructured: shell at `''` path with `authGuard` wrapping all authenticated child routes (company-info, invoices, generate). `app.ts`/`app.html` adds auth-loading overlay (spinner covering router-outlet while Firebase session rehydrates). Home component has been removed.Upon successful login user lands on invoices page. Feature component per-page back buttons + page-level headers removed (navbar takes over). 7 new tests (3 nav-links, router-outlet, sign-out call, busy state + 2 app-loading tests). 394 total pass, lint + build clean. Mobile-viewport verification (360×640 and 768×1024): not possible in this environment — deferred to T6.2 manual dry-run.

### [x] T6.2 — End-to-end dry run
Generate a full sample month against a real test workspace; eyeball the sheet against the 2025 reference for plausibility; confirm balance ∈ [0,8] and totals reconcile.
- **Deps:** T6.1
- **Done when:** a generated sheet looks correct and passes all invariants manually.
- Dry run successful with minor planned improvements - UI (error handling, create/edit invoice, invoice list), store formulas in generated sheet, etc.

### [x] T6.3 — Hosting deploy
Run `firebase init hosting` to create `firebase.json` and `.firebaserc` (public dir = the Angular build output, SPA rewrite to `index.html`). Add the production build + deploy step. Ensure the deployed domain is added to Firebase Auth **authorized domains** and to the Google OAuth client's allowed origins, or sign-in will fail in production.
- **Deps:** T6.2
- **Done when:** `firebase deploy` publishes the app and the hosted URL runs the full sign-in → generate flow.
- `firebase.json` (public=`dist/travel-sheet-app/browser`, SPA rewrite, cache headers) + `.firebaserc` (project `latituderealize-travel-sheet`) + `npm run deploy` script (`ng build --configuration production && firebase deploy --only hosting`); production `environment.ts` filled with real Firebase config; deployed to https://latituderealize-travel-sheet.web.app. **Manual step required:** add `latituderealize-travel-sheet.web.app` to Firebase Auth → Authorized domains and to Google Cloud Console → OAuth client → Allowed JavaScript origins.

### [x] T6.4 — README
Document the required Drive setup (exact folder/sheet/workbook names from `workspace.config`), env/secret setup, and how to run/test/deploy.
- **Deps:** T6.3
- **Done when:** a fresh reader can set up Drive and run the app from the README alone.
- Rewrote README with Drive setup (folder/sheet/workbook names + tab schemas), Firebase/OAuth config steps, authorized-domain checklist, and all commands. Updated `npm start` to `ng serve --port 5000`.

---

## Phase 7 — UI/UX refresh

> Page-by-page modernization of the UI. Reference mockups live in `docs/mockups/`. Brand palette + responsive rules per `CONVENTIONS.md` §8/§8a. UI-layer components are Angular-only — no `domain/` imports.

### [x] T7.1 — Shared UI primitives: Modal + Toast
Build reusable `shared/ui/modal` and `shared/ui/toast` primitives so later page redesigns reuse them instead of re-implementing dialog/notification behavior.
- **Deps:** T6.1
- **Done when:** `Modal` (standalone) renders a blurred, scroll-locked backdrop; traps focus while open; closes on Esc, backdrop click, and an explicit ✕; restores focus to the trigger on close; sets `role="dialog"`, `aria-modal`, and `aria-labelledby`; supports projected header/body/footer. `ToastService` exposes a signal-backed queue; a host outlet renders success/error toasts with auto-dismiss and an optional action slot. Both covered by Vitest. Mobile-first per §8a (≥44 px targets, safe-area insets, `:focus-visible`).

### [x] T7.2 — Invoices: header action + table list + icon actions
Restructure the invoices page around the data: primary action in the page header, scannable list, icon-based row actions. Mockup: `docs/mockups/invoices.html`.
- **Deps:** T7.1
- **Done when:** the page header shows `Invoices (N)` plus a gold **Add invoice** button (old top-of-page form removed from the default view); the list renders as an aligned, tabular-numeric table at ≥640 px and collapses to stacked cards below (§8a); Edit/Delete are icon buttons with `aria-label` + `title` and ≥44 px hit targets, delete carrying a danger hover state only. Existing invoices specs updated and green; lint + build clean.

### [x] T7.3 — Invoices: modal-based create/edit (reused) + confirm-delete
Move the upload/edit form into the T7.1 `Modal`, reused for both add and edit; replace `window.confirm` with a branded confirm dialog; surface async outcomes as toasts.
- **Deps:** T7.2
- **Done when:** **Add invoice** and the row Edit action open the same modal (title swaps "Add invoice"/"Edit invoice"; on edit the file input is hidden and `DriveFileId` is preserved); the existing no-file / unparseable-date / missing-required-field guards still block submit; Delete opens a branded confirm dialog (`Delete <vendor> invoice?`) and only deletes on confirm; upload/edit/delete success and failure fire toasts. Specs cover modal open/close, both submit modes, DriveFileId preservation, and both confirm-delete branches. Lint + build clean.

### [x] T7.4 — Invoices: layered error handling
Replace the single raw-message error box with layered, accessible error reporting.
- **Deps:** T7.3
- **Done when:** invalid fields show an inline message under the offending input; a form-level summary at the top of the modal lists all problems after a failed submit (`role="alert"`); `InvoiceService` async failures route to error toasts rather than a raw `err.message` dump (no such dump remains). Specs cover field-level errors, the summary, and the service-error path. Lint + build clean.

### [x] T7.4a — Invoices: clear mobile card layout
Finish the half-built mobile card layout from T7.2: the stacked cards render unlabeled, side-by-side values (`60.23` / `1.52 EUR` / `91.55 EUR`) that can't be told apart, and the row actions float in dead space. Desktop table stays untouched.
- **Deps:** T7.2
- **Done when:** below 640 px each invoice renders as a card with (a) a title row — vendor bold + date muted/right-aligned, (b) hairline-divided labeled rows for Quantity / Unit price / Total using the existing `.table__card-label` slot (labels stay `display:none` on desktop), (c) the Total visually emphasized, (d) a unit suffix on the numbers (`60.23 L`, currency on price/total), and (e) the Edit/Delete actions divided off by a top border with ≥44 px hit targets. Desktop (≥640 px) table layout is unchanged. Specs assert the per-row labels render. Lint + build clean.
  - _Done: mobile row is now a named-areas grid (vendor/date title row, labeled qty/unit/total rows, divided action bar); icon buttons 44 px on mobile / 2.4 rem on desktop; `.table__unit` suffix mobile-only; new spec checks 3 labels × N rows. 422 tests green._

### [x] T7.5 — Company info: header pattern + read-only link + polished cards
Bring the read-only company/vehicle screen in line with the refreshed Invoices header and card styling. Editing stays forbidden (T5.2) — the only header action is an outward link to the source spreadsheet. Mockup: `docs/mockups/company-info.html`.
- **Deps:** T7.2
- **Done when:** the page header shows the title, a **Read-only** pill, and an **Open supporting sheet** link that opens `https://docs.google.com/spreadsheets/d/{id}/edit` in a new tab (`target="_blank"` + `rel="noopener"`), where `{id}` is surfaced from `SheetsStore.resolveSupportingSheetId()`; a short subtitle explains the values are sourced from the spreadsheet. The Company and Active-vehicle `dl/dt/dd` cards are restyled into hairline-divided key/value rows with a heading icon and tabular-numeric values + muted unit suffixes (consumption / tank / opening balance). Interpolation only — no `[innerHTML]` (XSS-escaping test retained). No edit/input controls added. Mobile-first per §8a (rows stack under ~540 px). Specs updated (including the resolved-id link href); lint + build clean.
  - _Done: header is title + Read-only pill + outward `Open supporting sheet` link (href built from the resolved id; new tab + noopener; non-navigable until resolved). Cards became icon-headed `.kv` lists — single-column key/value under 540 px, `13rem 1fr` above; tabular-numeric values with muted `L` / `L / 100 km` unit spans. Component injects `SheetsStore` directly. Specs cover pill/subtitle, the resolved-id href + target/rel, the pre-resolve no-href state, and the relaxed XSS/no-edit assertions. 425 tests green, lint + build clean. Mobile-first per §8a (single-column stack < 540 px, 44 px link target, header wraps); device-toolbar pass still pending a live run._

### [x] T7.6 — Company info: loading skeleton + error handling with Retry
Replace the plain "Loading…" text and the raw `err.message` box with the shared loading/error treatment.
- **Deps:** T7.1, T7.5
- **Done when:** the loading state renders skeleton rows (not plain text); a load failure shows a branded inline alert (`role="alert"`) **and** an error toast, plus a **Retry** button that re-invokes the master-data load. The T5.2 read-only assertion is relaxed from "zero buttons" to "no edit/input controls" (Retry and the outward link are non-mutating). Specs cover the skeleton state, the error+retry path, and the relaxed read-only assertion. Lint + build clean.
  - _Done: loading shows two shimmer skeleton cards (`role="status"` sr-only text + animated `.skeleton__bar`s, motion-reduced); failure renders a danger-bordered `role="alert"` with the message + a **Retry** button. Read-only test relaxed to "no input/textarea/select/contenteditable"; success view still 0 buttons, error view exactly 1 (Retry). Injects `ToastService`. 431 tests green, lint + build clean._
  - _Retry recovery (follow-up to the live GIS-timeout finding): user-initiated Retry now forces the Google consent prompt. Added `GoogleAuth.reauthorize()` (drops cached token, requests a `prompt:'consent'` token, caches it); `MasterDataService.load({ forceConsent })` runs `reauthorize()` inside its try so consent failures surface via the error signal and the cached token is reused by the parallel data calls (also sidesteps the concurrent-callback race). The component's initial load stays silent; only the Retry button passes `forceConsent: true`. `[disabled]="loading()"` guard kept (defensive; the loading/error branches are mutually exclusive). Specs added for reauthorize ordering, the default no-consent path, the reauthorize-failure→error path, and Retry calling `load({ forceConsent: true })`._
  - _**Retry pointer-events bug (the actual "Retry is disabled / does nothing" cause):** the T7.5 pending-link rule `.btn:not([href])` (opacity 0.55 + `pointer-events:none`) also matched the Retry `<button>` — buttons never have an `href`, so it matched permanently, dimming Retry and swallowing all clicks/hover. Scoped the rule to `a.btn:not([href])` so it only affects the outward link. Removed the now-pointless `[disabled]="loading()"` binding and gave Retry a solid filled style. Spec asserts the Retry button renders as a `<button>` and `disabled === false`._
  - _Memoize-on-success fix (root cause of "Retry does nothing"): `SheetsStore` resolvers (`resolveSupportingSheetId`, `resolveWorkbookId`, `resolveFolderId`, `resolveInvoiceTabSheetId`) cached the **rejected** promise, so once a lookup failed (e.g. renamed supporting sheet) every later call — including Retry — replayed the stale rejection until a full page reload. Each now clears its cached promise on rejection so a retry re-attempts the lookup. Component re-resolves the supporting-sheet id on Retry too, so the outward link lights up after recovery. Store spec asserts a failed lookup is retried (Drive hit twice). The Retry button itself was never disabled — the grey is just secondary-button styling._

### [x] T7.6a — Shared error-alert primitive + Invoices error/loading states
The Invoices page still showed master-data failures as `invoices__status--error` (dark-red text on a translucent-red box) — unreadable on the dark shell — and "Loading workspace…" as plain text. Unify error/loading UX across pages via a shared primitive. Mockup: `docs/mockups/error-states.html`.
- **Deps:** T7.1, T7.6
- **Done when:** a shared standalone `app-error-alert` lives in `shared/ui/` (inputs `title`/`message`/`retryable`/`retrying`/`retryLabel`, output `retry`; `role="alert"`, light surface, danger rail, alert glyph, friendly title + muted technical detail, solid Retry button). Company info is **refactored** onto it (single source of truth), and Invoices uses it for master-data failures with a friendly title + the raw message. The `.sk-bar` shimmer primitive + reduced-motion move to global `styles.scss`; Invoices gets a table-shaped loading skeleton replacing the plain text. `--app-danger`/`--app-danger-text` added as semantic tokens. Specs cover the shared component (render/title/message/retry/disabled-busy), the Invoices skeleton, the branded error + toast, and master-error Retry forcing consent. Lint + build clean.
  - _Done: `ErrorAlertComponent` (signal `input()`/`output()`) + spec; global `.sk-bar`/`@keyframes sk-shimmer`/reduced-motion + `--app-danger*` tokens in `styles.scss`. Company info error block + skeleton bars swapped to the shared component / `.sk-bar` (dead `.company-info__error*`, `.btn--retry`, local shimmer removed). Invoices: `app-error-alert` for master errors (`retryMaster()` forces consent + reloads invoices), `.sk-row` table skeleton, master-error→toast effect; removed `.invoices__status*`. 439 tests green (new error-alert spec file), lint + build clean._

### [x] T7.7 — Navbar: account dropdown + active indicator + cleanup
Modernize the shell nav: separate the account action from navigation, surface the signed-in identity, and clarify the active page. Mockup: `docs/mockups/navbar.html`.
- **Deps:** T6.1
- **Done when:** the existing PNG logo stays in the brand slot; nav links keep gold active text **plus** a 2px gold underline indicator on the active link; **Sign out** is moved out of the link row into an account control separated by a divider. Desktop shows an account button (avatar from the Firebase `User.photoURL` with an initials fallback derived from `displayName`/`email`, plus the email) opening a dropdown with name/email and **Sign out** (preserving today's busy state). The current user is surfaced as a signal from `GoogleAuth`/`AuthState` (`User.displayName/email/photoURL` — no new OAuth scope). The dropdown and the mobile drawer close on Esc and outside-click/tap; the mobile drawer shows the same links (active indicator bar) with an account row + Sign out at the bottom. Remove dead `font-*` rules on `.nav__brand` and replace the `margin-left/right: 10px` magic numbers with rem (§ conventions). Specs cover active-indicator rendering, dropdown open/close (Esc + outside), the surfaced-identity render (incl. initials fallback when `photoURL` is null), and sign-out still calling through. Lint + build clean.
  - _Done: `AuthState` now exposes a live `user` signal (seeded from `currentUser`, updated via `onAuthStateChanged`). Navbar derives `displayName`/`email`/`photoURL`/`initials` (computed); desktop account cluster = divider + avatar (photo or gradient-initials) + email + chevron → dropdown (name/email + Sign out), separated from the links. Active link keeps gold text + a 2px `::after` underline on desktop and a gold left-rail in the mobile drawer; the drawer carries the same links + an account row + Sign out at the bottom. Esc + outside-click close both the dropdown and drawer (`@HostListener` document keydown/click). Removed dead `.nav__brand` font-* rules; `10px` margins → centered `max-width` container. Specs (+6): active indicator, dropdown open/Esc, dropdown outside-click, identity render, initials fallback, photo avatar; sign-out tests retargeted to `.nav__signout`. 445 tests green, lint clean. (Two component SCSS files — navbar 5.6 kB, invoices 6.5 kB — now exceed the 4 kB style budget; warning only, see note.)_

### [x] T7.8 — Global Toast outlet in the app shell
Mount the T7.1 toast host once in the shell so toasts float above every page.
- **Deps:** T7.1, T7.7
- **Done when:** the `Toast` host outlet is rendered once in the navbar/shell layout (fixed-position, above page content, respects safe-area insets), so any page enqueuing via `ToastService` shows a toast without mounting its own outlet. Spec confirms a single outlet renders a queued toast from the shell. Lint + build clean.
  - _Done: `ToastOutletComponent` imported in `NavbarComponent` and `<app-toast-outlet />` appended after the `<div class="navbar-content">` block; its `:host { position: fixed }` rule keeps it above all page content. New spec in `navbar.component.spec.ts` enqueues a success toast via `ToastService` and asserts `.toast` renders inside the shell. 446 tests green, lint + build clean._

### [x] T7.8a — Shared style foundations (design tokens + button/card primitives)
Stop the cross-page CSS duplication at its root before the remaining page tasks clone it again. `.card` is redefined in 4 component SCSS files; `.btn`/`--primary`/`--danger` in 2 (with a latent bug: the modal's `.btn` "Cancel" is white-on-white on the light modal surface); page-header and many literals (`rgba(57,57,57,0.1)`, card radius/shadow) are copy-pasted. **Do this now, before T7.9**, so sign-in/generate consume the primitives.
- **Deps:** T7.6a (tokens/skeleton already partly global)
- **Done when:** `styles.scss` gains semantic tokens (`--radius-sm/md/lg/pill`, `--shadow-card/pop`, `--hairline-on-dark/-on-surface`, `--muted-on-surface`, `--danger-bg`) and global, unscoped primitives: `.card`, and a **colour-less base `.btn`** + variants `--primary` (gold), `--danger` (red), `--ghost` (dark text/border, for light surfaces), `--ghost-dark` (light text/faint border + pending-`:not([href])` + gold hover, for the dark shell). Invoices + Company info are refactored onto them (local `.btn*`/`.card` removed); the modal "Cancel" becomes `.btn--ghost` (fixing the white-on-white bug), the Company-info outward link becomes `.btn--ghost-dark`. No visual change beyond that fix; component SCSS shrinks back under the 4 kB budget. Specs stay green; lint + build clean. (Sign-in/generate keep local styles until their own tasks/the sweep — their scoped `.card` still wins via encapsulation, so no conflict.)
  - _Done: tokens + global `.card` and `.btn`/`--primary`/`--danger`/`--ghost`/`--ghost-dark` (incl. `a.btn--ghost-dark:not([href])` pending) added to `styles.scss`. Removed local `.btn*`/`.card` from invoices (498→441 lines) and company-info (221→178); modal Cancel → `.btn--ghost` (fixes white-on-white), outward link → `.btn--ghost-dark`. Build no longer warns on either file (under 4 kB again). 446 tests green, lint clean. T7.13 sweep will lower the `anyComponentStyle` budget back from the interim 8 kB._

### [x] T7.9 — Sign-in: brand the card + Google-standard button + friendly errors
Refresh the only unauthenticated screen. Mockup: `docs/mockups/sign-in.html`. Note: sign-in renders **outside** the shell, so errors stay inline on the card (no toast outlet here) — this task does **not** depend on T7.1.
- **Deps:** T6.1
  - _Done: card leads with `logo-travel-sheet.png` + title + muted intro, on the global `.card` primitive (local `.card*` removed). Gold button → **Google-standard** `.gbtn` (white, 1px grey border, multicolour "G" SVG, dark label; busy "Signing in…" preserved, hidden G while busy). New `mapSignInError()` maps Firebase `auth/*` codes + GIS timeout to friendly lines (popup blocked / closed / unauthorized-domain / timeout) with a generic fallback — no raw `err.message` surfaced; shown in a flat danger-tinted inline `role="alert"` (intentionally not the shadowed `app-error-alert`, which is for the dark shell). Subtle radial brand wash (not a full gold flood) + small page footer. Specs (+7): logo+button render, busy DOM state, friendly-error render, and 5 `mapSignInError` branches. UI copy kept English (no Cyrillic literal). 453 tests green, lint + build clean (sign-in.scss back under budget)._
- **Done when:** the card leads with the existing `logo-travel-sheet.png` mark above the title + intro; the action is a **Google-standard light button** (white background, 1px grey border, multicolor "G" mark, dark label) replacing the gold generic button, with the existing busy state ("Signing in…") preserved; raw `err.message` is replaced by **friendly mapped messages** for the common failures (popup blocked, popup closed/cancelled, unauthorized domain, GIS timeout) with a sensible generic fallback, shown in a styled inline alert (`role="alert"`). Keep the centered-card structure and a subtle brand footer; **no** full-page gold background wash. Specs cover the rendered logo + button, the busy state, and the error-mapping branches (mapped message for a known failure + generic fallback for an unknown one). Lint + build clean.

### [x] T7.10 — Generate: readable error alert
Fix the unreadable error block. Today `.card--error` paints `rgba(192,57,43,0.08)` over the **dark** app background with dark-red text — dark-on-dark, effectively invisible (see `docs/mockups/generate.html`).
- **Deps:** T6.1
- **Done when:** generation errors render on a **light surface** (`--app-surface`) with a red left rail and readable dark-red heading + body text; the existing message branches (`Not enough data` / `Infeasible month` / `Generation failed`) are preserved, with the technical `err.message` shown as muted secondary detail rather than the primary content. Contrast passes AA. Specs assert the error renders on the light surface and the branch headings still appear. Lint + build clean.
  - _Reopened: checkbox was ahead of the code (`.card--error` was still the unreadable translucent-red fill). Done: `.card--error` now keeps the light `.card` surface + a `--app-danger` left rail + `--app-danger-text` heading; `err.message` stays as the muted `.card__detail`; all three branch headings preserved. Spec asserts the error renders inside `.card--error` and the branch heading + technical detail appear._

### [x] T7.11 — Generate: success UX (toast + slim card, dev details collapsed)
Stop the "Sheet written" card persisting until refresh and stop leading with developer-oriented internals. Mockup: `docs/mockups/generate.html`.
- **Deps:** T7.1, T7.8, T7.10
- **Done when:** a successful generation fires an auto-dismissing success **toast** ("January 2026 generated · Open workbook") via `ToastService`; the inline result becomes a **slim success card** showing only end-user-relevant info (period, sheet name, working-day row count) plus an **Open workbook** deep link (`https://docs.google.com/spreadsheets/d/{workbookId}/edit#gid={sheetId}`, built from `resolveWorkbookId()` + the written tab's `sheetId`, new tab/`rel=noopener`); the developer fields (opening/closing balance, opening source, holiday source) move behind a collapsed **"Technical details"** `<details>` disclosure; holiday-fallback **warnings** stay visible (they are user-relevant). Specs cover the toast firing, the slim-card end-user fields, the workbook link href, the collapsed details, and warnings still rendering. Lint + build clean.
  - _Reopened: was unimplemented (old verbose "Sheet written" card, no toast/link/details). Done: `SheetsStore.writeSheet` now returns `{ workbookId, sheetId }`; `GenerateMonthResult` carries both. Component injects `ToastService`, fires a success toast (`"{Month} {Year} generated"` + **Open workbook** action) on success. Slim card = friendly period heading + sheet + working-day rows + **Open workbook** `<a>` deep link (`…/edit#gid={sheetId}`, `target=_blank rel=noopener`); opening/closing balance + opening/holiday source moved into a collapsed `<details>`; warnings stay visible. Submit + Open-workbook now use the global `.btn--primary` (dropped local `.form__button*`). Specs (+3): slim-card + link href, collapsed `<details>`, toast firing._

### [x] T7.12 — Generate: block regeneration of an already-generated month
Today `SheetsStore.writeSheet` silently `deleteSheet` + `addSheet` when the month's tab exists, overwriting it with fresh (non-deterministic) trips — and because the next month's opening is read from the prior sheet's closing, overwriting a month silently staleness-invalidates later months. Make the safe path the only path: guard the UI so an already-generated month cannot be regenerated in-app. Mockup: `docs/mockups/generate.html`.
- **Deps:** T7.10
- **Architecture note:** detecting an existing month requires reading the workbook's tab list — a **new exception to the "workbook is write-only except prior-month closing" non-negotiable** (CLAUDE.md / ARCHITECTURE §6). Document this exception in ARCHITECTURE §6 as part of this task before implementing.
- **Escape hatch (by design):** there is no in-app regeneration. To redo a month, the user deletes that month's tab in the workbook manually, after which the guard clears and generation is allowed again. The blocking alert states this.
- **Done when:** a `SheetsStore.sheetExists(sheetName)` (reads workbook tab metadata only) backs a **reactive** check that runs when the selected period (year/month) changes; when the target month already exists, the **Generate** button is disabled and a readable inline alert (light surface, per T7.10) explains the month is already generated and how to redo it (delete the `м_NN` tab in the workbook); when the month does not exist, the button is enabled and generation proceeds normally. The silent-overwrite path in `writeSheet` is no longer reachable from the UI for an existing month. ARCHITECTURE §6 updated with the read-back exception. Specs cover the exists→disabled+alert path, the not-exists→enabled path, and the period-change re-check. Lint + build clean.
  - _Reopened: was unimplemented (no `sheetExists`, no guard). Done: `SheetsStore.sheetExists(sheetName)` reads tab titles only (asserted: never calls `valuesGet`); `GenerateMonthService.monthExists(month)` maps to `monthSheetName`. Component runs a token-guarded async check on init + on every `(ngModelChange)` of year/month → `monthExists` signal; when true, **Generate** is disabled and a light-surface `.notice` alert names the `м_NN` tab + how to redo. `generate()` also short-circuits if the month exists, and flips the guard on after a successful write. ARCHITECTURE §6 exception (b) already documented. Specs (+4): exists→disabled+notice, not-exists→enabled, period-change re-check, guard short-circuits generate. 460 tests green, lint + build clean._

### [x] T7.13 — Style consolidation sweep + restore tight style budget
End-of-Phase-7 cleanup: now that every page exists, extract the remaining repeated patterns and turn the style budget back into a duplication detector.
- **Deps:** T7.8a, T7.9 (all pages refactored/landed)
- **Done when:** the remaining duplicated primitives are extracted to global/shared style partials under `src/styles/` (`_forms.scss` — `.form-field`/`.form-input`/`.form-label`; `_layout.scss` — `.page-head`/`.page-title`/`.page-sub`; `.pill`; `.kv` key/value rows), `@use`d from `styles.scss`; per-page copies removed and pages refactored onto them. Sign-in and Generate are folded onto the T7.8a `.card`/`.btn` primitives too. With duplication gone, lower `anyComponentStyle` `maximumError`/`maximumWarning` back to ~4 kB (or tighter) in `angular.json` so re-introducing a copied primitive trips the budget again. (The "shared primitives vs component styles" rule is already documented — CONVENTIONS §8b, added with T7.8a.) All specs green; lint + build clean with the tightened budget.
  - _Done: created `src/styles/_forms.scss` (`.form`/`.form__field`/`.form__label`/`.form__input` — kept BEM names to avoid template churn) and `_layout.scss` (`.page-head`/`.page-titlewrap`/`.page-title`/`.page-count`/`.page-sub`, `.pill`, `.kv`/`.kv__row`/`.num`/`.unit`), `@use`d from `styles.scss`; added global `.card--pad`. Refactored Invoices (head + form primitives removed; 463→405 lines), Company info (head/pill/kv/num/unit removed; 178→83), Generate (title/card/form removed, cards → `.card card--pad`, submit → `.btn--primary`; 235→182) onto the globals; Sign-in already on `.card`. Budget lowered 8 kB → **6 kB** (warning+error) — the floor sits just above navbar (5.6 kB) and invoices (5.25 kB), both legitimately large with no remaining duplication; a copied primitive now trips it. CONVENTIONS §8b updated with the full primitive inventory + partials + 6 kB note. 462 tests green, lint + build clean._

---

## Phase 8 — PDF export & Drive storage

> Builds on the completed base app (stores, generate flow, toast component, result-card pattern all exist).
> Architecture: ARCHITECTURE §10. Mockup: `docs/mockups/generate-and-pdf-export.html`.

---

### [ ] T8.1 — List generated months
Add a method to read the existing month sheets from the output workbook (the `м_MM` tabs) so the export dropdown only offers months that actually exist. Reuse `SheetsStore`; do not read sheet contents, only the tab list/metadata.
- **Deps:** existing `SheetsStore`
- **Done when:** a method returns the list of existing `м_MM` sheets (with a display label like "January 2026 (м_01)") from the real workbook; unit/smoke verified.

### [ ] T8.2 — Sheet-to-PDF export in SheetsStore
Add `SheetsStore.exportSheetAsPdf(workbookId, sheetId)`: fetch `https://docs.google.com/spreadsheets/d/{id}/export?format=pdf&gid={gid}&portrait=true&fitw=true&gridlines=false&single_sheet=true` with the GIS access token; return the response as a `Blob`. This is a direct `googleFetch` call — not via the `sheets.googleapis.com` client. Export params enforce portrait, fit-to-width, no gridlines, single tab.
- **Deps:** existing Google clients (T3.2), T8.1
- **Done when:** calling export for a given month returns a valid PDF whose layout matches the workbook sheet; verified by opening the output.

### [ ] T8.3 — Save PDF to Drive (overwrite) in DriveStore
Add `DriveStore.savePdfToFolder(blob, filename)`: query the Drive folder for a file with the same name; if found, call `files.update` (content replace); if not, call `files.create`. Filename convention: `Patenlist_<YYYY>_<MM>.pdf` (year and zero-padded month extracted from the `м_MM` sheet name). Return the saved file's Drive URL.
- **Deps:** T8.2, existing `DriveStore`
- **Done when:** export saves the file with the correct name; re-exporting the same month replaces the existing file (no duplicate); returns a usable Drive link.

### [ ] T8.4 — ExportPdfService (application layer)
Add an application service orchestrating: list months (T8.1) → export sheet (T8.2) → save to Drive (T8.3). Expose state for the UI (in-progress, success with filename + link, typed errors: sheet-not-found, export-failed, drive-write-failed). No domain logic involved.
- **Deps:** T8.1, T8.2, T8.3
- **Done when:** the service exports a selected month end-to-end and surfaces success (filename + link) or a clear typed error; nothing is saved on failure.

### [ ] T8.5 — Export PDF UI section (Generate screen)
Add the "Export month sheet as PDF" card to the Generate screen, matching `docs/mockups/generate-and-pdf-export.html`: section-heading icon (`ti-file-type-pdf`) + title, a single "GENERATED MONTH" dropdown (from T8.1), and a gold "Generate PDF" button (dark text, no icon). Match existing card/input/button styles exactly. Thin component — delegates to `ExportPdfService`.
- **Deps:** T8.4
- **Done when:** the section renders in the real page style; the dropdown lists existing months; the button is disabled until a month is selected; clicking it triggers export with a progress state.

### [ ] T8.6 — Result card + toast on success
On successful export, show (a) the persistent gold-left-border result card ("PDF exported" — FILE / SAVED TO + "Open PDF ↗" button), reusing the existing result-card pattern, and (b) the existing bottom-center toast reused for confirmation, with a green left-border, dark text, a gold underlined "Open PDF" action, and dismiss ×.
- **Deps:** T8.5, existing toast + result-card components
- **Done when:** a successful export shows both the result card and the toast in the real styles; the green left-border is applied to the toast; "Open PDF" opens the Drive file; errors surface via the existing error pattern.

### [ ] T8.7 — Requirements doc in repo
The screen mockup (`docs/mockups/generate-and-pdf-export.html`) is already committed. Ensure the Phase 1 requirements document (`docs/PDF_Export_Requirements.md`) is added to the repo as the narrative requirements reference, and that `TASKS.md` links to both.
- **Deps:** none (can be done first)
- **Done when:** `docs/PDF_Export_Requirements.md` exists with the Phase 1 FR/NFR text; this task entry links to both the doc and the mockup.

### [ ] T8.8 — Scope check
Confirm the existing Drive OAuth scope permits the export + folder file creation/overwrite. If not, add the minimal scope and re-test sign-in (no broader scope than needed).
- **Deps:** T8.2, T8.3
- **Done when:** export + save work under the app's scopes; if a scope was added, sign-in still works and nothing else broke.

---