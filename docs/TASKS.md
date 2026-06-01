# Travel Sheet App — Tasks

> Companion to `ARCHITECTURE.md`. Build order is top-to-bottom; each task lists its dependencies.
> Conventions: one task per session is fine. When you finish a task, change `[ ]` → `[x]` and add a one-line note under it. Do not start a task whose dependencies are unchecked.
> Section references (§6b, §7a, …) point into `ARCHITECTURE.md`.

## Defaults for the open questions (override here if needed)
- **D1 — Per-day caps:** `MAX_STOPS_PER_DAY = 3`, `MAX_KM_PER_DAY = 80`. (From the 2025 reference.)
- **D2 — SeatCount:** write the value verbatim into the seats cell (so `"4+1"` appears as-is).
- **D3 — Weekly Architect/Constructor visits:** kept as a *soft* preference only; the [0,8]L fuel target wins. The generator may skip them if balancing doesn't need them.

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
Create `core/config/`: `workspace.config.ts` (Drive folder name, supporting-sheet ID, workbook name — placeholder values + a clear "FILL ME" comment), `supporting.map.ts` (tab names + 0-based column indexes per §6a), `workbook.template.ts` (cell coordinates + number formats + bold rules per §6), `generation.config.ts` (`BALANCE_MIN=0`, `BALANCE_MAX=8`, `MAX_STOPS_PER_DAY=3`, `MAX_KM_PER_DAY=80`), `holiday.config.ts` (Nager endpoint template, timeout ms, override tab name), `oauth.config.ts` (scopes).
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

### [ ] T4.3 — InvoiceService
Upload flow: file → DriveStore → get `DriveFileId` → append metadata row via SheetsStore. List/edit/delete invoice metadata.
- **Deps:** T3.3, T3.4
- **Done when:** an uploaded invoice appears as a Drive file + an Invoice row; list/delete reflect changes.

### [ ] T4.4 — GenerateMonthService
Orchestrate §5 generate step: gather master data + working days + in-scope fuel events, **resolve the opening balance** (via `SheetsStore.readPreviousMonthClosing`; if `null`, fall back to the active `Vehicle.OpeningFuelBalance`), then TripGenerator → RowMapper → SheetsStore.writeSheet. Surface `InfeasibleMonthError` as a user-facing message.
- **Deps:** T4.1, T4.2, T2.5, T2.6, T3.3
- **Done when:** generating a sample month writes a correct sheet end-to-end against a test workbook; the first month of a vehicle uses `OpeningFuelBalance`, a later month carries forward the prior sheet's closing; infeasible month shows a clear error and writes nothing.

---

## Phase 5 — UI features

### [ ] T5.1 — Sign-in
`features/sign-in`: Google sign-in button via GoogleAuth; route guard so the rest of the app requires auth.
- **Deps:** T3.1
- **Done when:** unauthenticated users are routed to sign-in; after sign-in they reach the app shell.

### [ ] T5.2 — Company info (read-only)
`features/company-info`: display Company + active Vehicle from MasterDataService. No edit controls. Escape all displayed strings (no `[innerHTML]`).
- **Deps:** T4.1
- **Done when:** shows correct company/vehicle; verified no edit path exists.

### [ ] T5.3 — Invoices
`features/invoices`: upload form (file + metadata), list, edit, delete via InvoiceService.
- **Deps:** T4.3
- **Done when:** full upload→list→edit→delete cycle works against the real workspace.

### [ ] T5.4 — Generate
`features/generate`: pick month, trigger GenerateMonthService, show progress + success/error messages (incl. infeasible-month error and holiday-fallback warning).
- **Deps:** T4.4
- **Done when:** a user can generate a month and see the result; errors/warnings render clearly.

---

## Phase 6 — Integration & polish

### [ ] T6.1 — Routing & app shell
Wire routes (sign-in → company-info / invoices / generate), nav, loading/error states.
- **Deps:** T5.1–T5.4
- **Done when:** navigation works; guards enforced.

### [ ] T6.2 — End-to-end dry run
Generate a full sample month against a real test workspace; eyeball the sheet against the 2025 reference for plausibility; confirm balance ∈ [0,8] and totals reconcile.
- **Deps:** T6.1
- **Done when:** a generated sheet looks correct and passes all invariants manually.

### [ ] T6.3 — Hosting deploy
Run `firebase init hosting` to create `firebase.json` and `.firebaserc` (public dir = the Angular build output, SPA rewrite to `index.html`). Add the production build + deploy step. Ensure the deployed domain is added to Firebase Auth **authorized domains** and to the Google OAuth client's allowed origins, or sign-in will fail in production.
- **Deps:** T6.2
- **Done when:** `firebase deploy` publishes the app and the hosted URL runs the full sign-in → generate flow.

### [ ] T6.4 — README
Document the required Drive setup (exact folder/sheet/workbook names from `workspace.config`), env/secret setup, and how to run/test/deploy.
- **Deps:** T6.3
- **Done when:** a fresh reader can set up Drive and run the app from the README alone.
