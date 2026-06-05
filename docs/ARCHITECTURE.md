# Travel Sheet App — Architecture

> Status: v3 (POC, finalized for review) · Stack: Angular + Firebase + Google Sheets/Drive
> Scope: Single-user POC that generates **one month** of a Bulgarian travel sheet ("Пътен лист") into a Google Sheets workbook. Yearly generation deferred.
> References: layout from `Travel_sheet_2025_m03-m12.xlsx`; data schema from `SupportingSpreadsheet.xlsx`; trip rules from Notion *Trip Generation Logic*.

## 1. Guiding principles

1. **Source vs. output separation (with two POC exceptions).** The *supporting spreadsheet* is the source of truth; the *annual workbook* is a write target. (PRD: FR-17.) The workbook is treated as write-only except for **two** narrow, read-only carve-outs:
   - **(a) Opening-balance carry-forward.** The generator reads *one value* back from the workbook — the previous month's closing balance (`Крайно количество`) — to use as the current month's opening balance. **Why this is acceptable here:** generated sheets are neither locked nor reviewed in-app (locked decision), so a human may correct a sheet directly in the workbook; reading the closing balance back means those manual corrections flow forward into the next month automatically. The first month of a vehicle's history has no prior sheet, so its opening balance is seeded from the supporting sheet (`Vehicle.OpeningFuelBalance`).
   - **(b) Already-generated guard (metadata only).** Before generating a month, the app reads the workbook's *tab list* (sheet titles only — never row content) to check whether that month's sheet already exists. **Why this is acceptable here:** `writeSheet` overwrites an existing tab (`deleteSheet` + `addSheet`) with fresh, non-deterministic trips, and because exception (a) reads a month's closing forward into the next month's opening, a silent overwrite would staleness-invalidate later months. The guard turns that footgun into a blocked, explained UI state (see TASKS T7.12): an existing month disables **Generate** and tells the user to delete the tab manually to redo it. This read touches only tab titles, not generated data.

   These are the *only* workbook reads; everything else still treats the workbook as write-only.
2. **Pure domain logic.** The hard logic — Bulgarian working-day calendar, trip generation, fuel balancing — is plain TypeScript with no Angular/Google dependencies, so it is unit-testable in isolation. (PRD: NFR-8.) For the POC this is achieved by passing plain data in and out of domain functions — **not** by introducing repository interfaces.
3. **POC simplicity (locked decisions).**
   - No `ISheetsStore` / `IDriveStore` / route-provider **interfaces**. Stores are concrete classes called directly by the application layer.
   - **No workspace-connection step.** The Drive folder, supporting spreadsheet, and workbook are all **looked up by name** from `workspace.config.ts` (the supporting sheet and the workbook live inside the configured folder). The user prepares their Drive with these exact names beforehand.
   - **No Maps/Routes API.** Leg distances are **predefined** (looked up from the supporting spreadsheet), so there is no live distance integration.
   - **Monthly generation only.** Yearly/full-year generation is **out of POC scope** (deferred). The POC polishes a single-month generator; year generation becomes trivial to add later by looping months.
   - **Single active vehicle ⇒ no within-month split.** Exactly one vehicle has `IsActive = true`. A vehicle change is modelled by adding a new vehicle (set active) and deactivating the old one; the new vehicle applies from the next generated month onward. So each month maps to one vehicle → one sheet `м_MM` (no `_<code>` suffix needed for the POC). Mid-month split is deferred with yearly generation.
4. **Least privilege.** Narrowest OAuth scopes that work. (PRD: NFR-1.)
5. **Bulgarian working days via API + override.** Working days come from the **Nager.Date** public-holiday API (`https://date.nager.at/api/v3/PublicHolidays/{year}/BG`) — free, no key, CORS-enabled for client-side use. A supporting-sheet override list handles ad-hoc government decrees the API misses; fetched holidays may be cached there during generation.

## 2. Technology stack

| Concern | Choice | Notes |
|---|---|---|
| UI framework | Angular | Standalone components, signals for state. |
| Hosting | Firebase Hosting | PRD NFR-5. |
| Identity | Firebase Auth (Google Sign-In) | "Who is the user". |
| Google API access | Google Identity Services (GIS) token client, **client-side** | Short-lived (~1h) access tokens; silent re-consent. No backend for the POC. |
| Persistence | Google Sheets only | No Firestore / no separate DB. |
| Output | Google Sheets workbook | Written via Sheets API. |
| File storage | Google Drive | Invoice file upload. |
| Distances | Predefined values in supporting sheet | No Routes API. |
| Working days | Nager.Date holiday API + supporting-sheet override | Free, no key, CORS-ok. |

> **Auth note:** browser-only OAuth tokens expire with no refresh token — fine for a self-run POC. This is the main thing that would justify a backend in production (maps to NFR-9 "extend later").

## 3. Layered architecture

Three logical layers plus a thin Google infrastructure layer. Dependencies point toward the **domain**, which depends on nothing. Because there are no port interfaces, "purity" is kept by the application layer doing all I/O and handing **plain data** to domain functions.

```
┌──────────────────────────────────────────────────────────┐
│ Presentation (Angular standalone components + routing)      │
│   sign-in · company-info (read-only) · invoices · generate  │
└───────────────────────────┬────────────────────────────────┘
                            │ calls
┌───────────────────────────▼────────────────────────────────┐
│ Application (orchestration services)                         │
│   GenerateMonthService · InvoiceService ·                    │
│   MasterDataService · CalendarService                        │
│   (fetch via stores → call domain → write via store)         │
└───────────┬───────────────────────────────┬─────────────────┘
            │ passes plain data              │ uses
┌───────────▼───────────────┐   ┌────────────▼─────────────────┐
│ Domain (PURE TypeScript)   │   │ Infrastructure (Google + http) │
│   TripGenerator            │   │   SheetsStore  (read master,   │
│   FuelBalanceCalculator    │   │                 write workbook)│
│   WorkingDayCalendar (BG)  │   │   DriveStore   (invoice upload)│
│   RowMapper                │   │   HolidayProvider (Nager.Date) │
│   entities/ (plain models) │   │   GoogleAuth   (GIS + Firebase)│
└────────────────────────────┘   │ (concrete classes, no iface)   │
                                  └────────────────────────────────┘
```

## 4. Module / folder structure

```
src/app/
├── core/
│   ├── auth/                 # Firebase Auth + GIS token client wrapper
│   ├── config/               # HARDCODED workspace config + sheet/cell maps
│   │   ├── workspace.config.ts   # Drive folder name, supporting sheet ID, workbook name
│   │   ├── supporting.map.ts     # supporting-sheet tab names + column indexes
│   │   └── workbook.template.ts  # cell layout for output (see §6)
│   └── google/               # low-level Sheets/Drive HTTP clients
├── domain/                   # PURE TypeScript — no Angular, no Google
│   ├── entities/             # Company, Vehicle, Location, RouteLeg,
│   │                         #   Invoice, GeneratedRow, MonthSheet, Holiday
│   ├── calendar/             # WorkingDayCalendar (weekends + holidays → working days)
│   ├── generation/           # TripGenerator, RouteDistance, FuelBalanceCalculator, ZeroTripRules
│   └── mapping/              # RowMapper: GeneratedRow[] → workbook cells
├── infrastructure/           # concrete Google + http "stores" (no interfaces)
│   ├── sheets.store.ts       # reads supporting sheet; writes workbook
│   ├── drive.store.ts        # uploads invoice files
│   └── holiday.provider.ts   # Nager.Date fetch (+ supporting-sheet override)
├── application/
│   ├── master-data.service.ts    # loads Company/Vehicles/Locations/route legs
│   ├── calendar.service.ts       # resolves working days for a month (provider + override)
│   ├── invoice.service.ts
│   └── generate-month.service.ts # the single generation entry point
└── features/
    ├── sign-in/
    ├── company-info/         # READ-ONLY display of company data from supporting sheet
    ├── invoices/             # upload + review/edit/delete invoice metadata
    └── generate/             # MONTH generation + status (no yearly in POC)
```

> Naming: Angular convention `*.store.ts` / `*.service.ts` is used instead of "repository".

## 5. Primary data flow (happy path)

```
Sign in (Firebase Auth + GIS scopes)
   → MasterDataService loads Company, active Vehicle, Locations + route legs
       from the hardcoded supporting spreadsheet
   → company-info shows the company read-only (no edit)
   → Upload invoices (file → Drive via DriveStore, metadata → supporting sheet)
   → Generate ONE month:
        1. Pick the single active vehicle (IsActive) → one segment → one sheet м_MM
        2. CalendarService → working days (Nager.Date holidays + override)
        3. SheetsStore → invoices + route legs in scope (plain data)
        4. TripGenerator → one row per working day (+ zero-trip rules)  [logic per §6b]
        5. FuelBalanceCalculator → consumption + running balance from opening balance
        6. RowMapper → workbook cells per the fixed template (§6)
        7. SheetsStore.writeSheet() → workbook (single sheet for the month)
```

> Trip-generation logic is specified in Notion → *Travel Sheet App - Trip Generation Logic*; summarised as the build contract in §6b below.

## 6. Output template (extracted from the 2025 workbook — this is the contract for RowMapper)

Sheet name pattern for the POC: `м_MM` (single active vehicle ⇒ no suffix). The 2025 reference
shows `_<code>` suffixes (`м_12_GLC`, `м_01_GLC`) from a multi-vehicle period — that split is
deferred with yearly generation and not built in the POC. Columns **A–H**, layout is fixed:

| Region | Cells | Content |
|---|---|---|
| Company header | `A1`,`A2`,`A3` | Name, `ЕИК: …`, address (merged across A:H) |
| Title | `A5` | `П Ъ Т Е Н   Л И С Т` |
| Period | `D7` | `За период: 01.MM.YYYY - <lastday>.MM.YYYY` |
| Vehicle line | `A9`/`C9`/`D9`/`E9` | `Автомобил` / model / `рег. №` / plate |
| Seats & fuel | `A10`/`C10`/`D10`/`E10` | `Брой места:` / count / `гориво` / fuel type |
| Column headers | row `12`, `A`–`H` | №, Дата, Маршрут, пробег км., Ср. Разход л./100км, Разход Общо литри, Заредено количество, Наличност литри |
| Data rows | from row `13` | one row per working day / fuel event |
| Totals | after data | `Крайно количество` (closing balance, col H) and `Общо количество` (Σ consumed col F, Σ fueled col G) |
| Signatures | bottom | `Водач` / `Одобрил` + name/date/подпис header row |

Row types within the data region:
- **Opening** — `Маршрут = "Начално количество"`, D = `х`, H = opening balance (= prior segment closing for that vehicle).
- **Fuel** — `Маршрут = "Зареждане гориво - <merchant> - <liters> л * <price> лв/л = <total> лв общо"`, G = liters fueled, H = new balance; D/E/F blank.
- **Trip** — route string `Борово - <stops> - Борово`, D = km, E = avg (constant per vehicle, e.g. 11.5), F = D×E/100, H = prev − F.
- **Zero-trip** — date only, E = avg, F = 0, H unchanged (working day with no travel).

## 6a. Supporting-spreadsheet schema (the data-model contract — verified from `SupportingSpreadsheet.xlsx`)

Five tabs, header row 1, data from row 2. Every entity has `Id`; all but Company carry `CompanyId`.

**Company** (`A:E`): `Id, Name, Eik, Address, ReportingYear`. Single active company row.

**Vehicle** (`A:J`): `Id, CompanyId, Name, RegistrationNumber, FuelType, SeatCount, AverageConsumptionLitersPer100Km, TankCapacityLiters, IsActive, OpeningFuelBalance`.
- `SeatCount` may be a string (e.g. `"4+1"`) → treat as text, written verbatim.
- `IsActive` (bool) selects the vehicle used for generation. Exactly one active expected. A vehicle change = add a new active vehicle and deactivate the old; it applies from the next generated month.
- `AverageConsumptionLitersPer100Km` is the per-vehicle constant in trip column E. **Immutable once the vehicle row is created** (never edited afterwards).
- `OpeningFuelBalance` seeds the opening balance for the vehicle's **first** generated month (year start, or the first month after the vehicle becomes active). Later months read the prior month's closing from the workbook instead (see principle 1).

**Location** (`A:F`): `Id, CompanyId, Name, Type, NameBg, Address`.
- `Type` ∈ {Office, Constructor, Architect, Project}. Exactly one Office (trip origin/terminus). Multiple Projects allowed.
- `NameBg` is the string written into the route text in the workbook.

**Route** (`A:E`): `Id, RouteName, StartPointId, EndPointId, DistanceKm`.
- **Undirected pairwise distances.** 15 rows = all 6×5/2 location pairs. Look up by matching {Start,End} in either order.
- A multi-stop trip's km = sum of consecutive pairwise legs, including the return leg to Office. (Office round-trip = 2 × Office-X.)

**Invoice** (`A:K`): `Id, CompanyId, ReportingYear, VehicleId, FuelVendor, InvoiceDate, QuantityLiters, UnitPrice, TotalAmount, Currency, DriveFileId`.
- Written by the app on upload; `DriveFileId` links to the uploaded file in Drive.
- Drives fuel rows: vendor + quantity + price → the `Зареждане гориво …` row string and the balance top-up.

> Note: this company (Уи Денс ЕООД, GLC active) differs from the 2025 workbook sample (ЛАТИТЮД, CLA). The workbook was a **layout** reference only; the supporting sheet is the **data** source of truth.

## 6b. Trip-generation contract (distilled from Notion → *Trip Generation Logic*)

`TripGenerator` is a **pure function**: `(workingDays, fuelEvents, locations, routeLegs, vehicle, openingBalance) → GeneratedRow[]`.

> **Opening-balance resolution (done by the application layer, not the pure generator):** `openingBalance` is computed *before* calling the generator and passed in as plain data, so the domain stays pure. Rule: if a workbook sheet exists for the previous month **and** it belongs to the currently active vehicle, read its `Крайно количество` (closing) cell and use that; otherwise (no prior sheet, or the prior sheet was a different vehicle) use `Vehicle.OpeningFuelBalance` from the supporting sheet. This is read-back exception (a) under principle 1 (the value read; exception (b) is the metadata-only already-generated guard).

Rules:
- **One trip row per working day.** Each is single-stop, multi-stop, or a zero-trip row.
- **Every route starts and ends at the Office.** Intermediate stops may be Project / Architect / Constructor locations.
- **Destination priority:** Projects first (distributed across the month), then ~one Architect visit/week and ~one Constructor visit/week unless balancing needs more.
- **Distance** = sum of consecutive pairwise legs (undirected lookup in `Route`), including the return leg to Office. Never negative; zero stops ⇒ zero-trip row.
- **Fuel consumed** per row = `km × vehicle.avgConsumption / 100` → column F.
- **Zero-trip day** when no destination is assigned, the month already meets the fuel-balancing target, more travel would overconsume, or remaining days can still satisfy weekly-visit minimums. Blank route, 0 km, 0 L; row still appears in date sequence.
- **Same-day fuel + trip ordering:** opening row (if any) → fuel row → trip row, so the post-fuel balance is available before the day's consumption.
- **Tie-breakers (soft, in order):** prefer routes including Projects; prefer fewer stops; prefer satisfying weekly Architect/Constructor visits.
- **Balancing objective (concrete):** the `[0, 8]` L window applies **just before every fuel event** ("I refuel when the tank is nearly empty"), not at month end. The month is partitioned into **segments** by fuel events: each pre-fuel segment must drop the balance into `[0, 8]` L before the next top-up. The **trailing segment** (after the last fuel of the current month) is capped by a **`trailingTmax`** computed from *next month's* first-fuel constraint — see "Next-month look-ahead" below. The running balance must **never go below 0** on any day. The window was chosen wide on purpose so the picker has room to vary daily trip lengths.
- **Next-month look-ahead (precondition).** Generating month M requires that the supporting sheet already contain the first fuel invoice of month M+1 for the active vehicle. The application layer locates that next-month first invoice, asks `CalendarService` for next month's working days, counts `N_next` working days strictly before that fuel date, and computes `trailingTmax = BALANCE_MAX + N_next × MAX_KM_PER_DAY × vehicle.avgConsumption / 100`. This is passed into the pure generator as `GenerateInput.trailingTmax`. If next-month data is missing, the application layer throws `InsufficientDataError` — a **distinct** error from `InfeasibleMonthError`, so the user knows the issue is missing data rather than over-fueling.
- **Distribution model:** within each segment the picker draws from a **range** of feasible per-day km `[x_min, x_max]` (not the single km closest to an average), weighting candidates loosely toward a soft target with a wide spread for variety. **Zero-trip rows are emitted only when no route fits the day's feasible window** — i.e., the picker always prefers a short route over a voluntary zero. Two runs of the same month may produce different trip rows; only the fuel events are fixed anchors.
- **Determinism is NOT required.** Two runs of the same month may produce different trip rows and that is acceptable. **The fixed anchors are the fuel events** (date, vendor, liters, price, resulting top-up) taken verbatim from invoice metadata — these must be identical every run and on their real dates. Everything else (which destinations, which zero-trip days) may vary as long as every invariant in §8 holds. This trades reproducibility for a much simpler generator; auditability (NFR) is satisfied by recording *what was generated and from which source data*, not by reproducibility.
- **Feasibility guard:** before generation walks the timeline, **every** segment is checked individually — pre-fuel segments against their `[0, 8]` window, and the trailing segment against `trailingTmax`. If `N working days × MAX_KM_PER_DAY` cannot burn enough liters to drop the start balance to ≤ the segment's `Tmax`, generation **fails with `InfeasibleMonthError`**: pre-fuel failures name the offending fuel event; trailing failures say "Next month's first fuel cannot be absorbed …" so the user can tell where the conflict is.

## 7. Configuration (centralized, hardcoded for POC)

`core/config` holds everything environment-specific so changes are one-file edits (NFR-8):
- `workspace.config.ts` — Drive folder name, supporting-spreadsheet name, output workbook name (**user must create these exact names in Drive**; the supporting sheet and the workbook are resolved by name inside the folder via Drive's `files.list`).
- `supporting.map.ts` — tab names (`Company`,`Vehicle`,`Location`,`Route`,`Invoice`) + column maps per §6a. **Verified against the real sheet.**
- `workbook.template.ts` — the §6 cell map, number formats, bold rules (fuel rows, totals).
- `generation.config.ts` — `BALANCE_MIN = 0`, `BALANCE_MAX = 8` (liters); per-day caps `MAX_STOPS_PER_DAY`, `MAX_KM_PER_DAY` (bounds the search and keeps routes plausible — tune to the 2025 reference, ~3 stops / ~80 km).
- `holiday.config.ts` — `https://date.nager.at/api/v3/PublicHolidays/{year}/BG`, request timeout, and the supporting-sheet override tab name.
- OAuth scopes.

## 7a. External data hardening (Nager.Date holiday API)

The holiday response is **untrusted third-party data**. The `HolidayProvider` must:
1. **HTTPS-only, pinned host.** Hard-code the `https://date.nager.at` origin; reject any other/non-HTTPS URL.
2. **Parse as data, never execute.** `JSON.parse` only — never `eval`, never inject any field into the DOM as HTML. (Angular interpolation auto-escapes; never bind API strings via `[innerHTML]`.)
3. **Schema-validate each entry.** Accept an item only if `date` matches `^\d{4}-\d{2}-\d{2}$`, parses to a real date, and falls inside the requested year. Discard everything except `date` — generation needs no other field.
4. **Bound the payload.** Reject absurd responses (e.g. > 60 entries) to avoid bad input.
5. **Timeout + safe fallback.** On error, timeout, or failed validation, fall back to the supporting-sheet override list and surface a warning — never silently emit a wrong calendar.
6. **Optional cross-check.** Compare the fetched set against a small hardcoded expected BG holiday set for the reporting year; warn on mismatch.

## 8. Testing strategy

Because trip rows are **non-deterministic**, tests assert **invariants**, not exact row-by-row output. Every generated month must satisfy:

- **Fuel rows are exact & fixed:** one fuel row per invoice, on the invoice date, with vendor/liters/price/total matching metadata verbatim; the `Зареждане гориво …` string is byte-correct.
- **One row per working day** (trip or zero-trip), in date order, plus opening and the two totals rows.
- **Balance never negative** on any row; **balance on the row immediately preceding each fuel row ∈ [0, 8]** liters. The month-end closing balance is unconstrained on the upper side (only `≥ 0`) — it rolls forward as next month's opening.
- **Per-row fuel math:** `consumed = round(km × avg / 100, 2)`; running balance = prev + fueled − consumed.
- **Routes well-formed:** start and end at Office; stops ∈ {Project, Architect, Constructor}; `km = Σ pairwise legs` (undirected); within per-day caps.
- **Totals correct:** `Общо количество` = Σ consumed (F) and Σ fueled (G); `Крайно количество` = closing balance.
- **Trip-length diversity:** across non-zero trip rows in a month, more than one km value appears — guards against the picker collapsing to a single distance.
- **Zeros are forced, never voluntary:** every zero-trip row corresponds to a day where no route fits the per-day budget (typically because the running balance is below the smallest route's burn). The picker never chooses zero while a feasible route exists.
- **Feasibility (in-month):** an over-fueled pre-fuel segment that cannot drop balance to ≤ 8 L fails with `InfeasibleMonthError` naming the offending fuel event (tested with a crafted fixture).
- **Feasibility (next month):** if the trailing segment cannot drop to the look-ahead `trailingTmax`, generation fails with a trailing-specific `InfeasibleMonthError` message.
- **Insufficient data:** if month M+1 has no fuel invoice for the active vehicle, generation throws `InsufficientDataError` (distinct from `InfeasibleMonthError`) and never writes a sheet.

Layers:
- **Unit (priority):** pure `domain/` — `WorkingDayCalendar`, `RouteDistance`, `FuelBalanceCalculator`, `TripGenerator` (assert invariants), `RowMapper` (assert exact cells for fixed inputs).
- **HolidayProvider:** validation/sanitization tests with malformed, oversized, and non-HTTPS payloads; fallback-to-override test.
- **Store smoke tests:** `SheetsStore`/`DriveStore` against a real test workspace.
- **Manual E2E:** generate a month, eyeball against the 2025 reference for plausibility.

## 9. Open questions

Resolved: ✅ schema (§6a) · ✅ distances = undirected pairwise legs, summed · ✅ vehicle selection via `IsActive`, no within-month split · ✅ monthly only, yearly deferred · ✅ working days from Nager.Date + override, with hardening (§7a) · ✅ trip rules (§6b) · ✅ **balancing objective = pre-fuel-event balance in [0, 8] L (per-segment), trailing segment unconstrained, balance never negative** · ✅ **distribution = range-based per-segment picker with scattered zeros** · ✅ **determinism NOT required; fuel events are the fixed anchors** · ✅ testing by invariants (§8).

Still open (minor — won't block scaffolding):
1. **Per-day caps.** Confirm `MAX_STOPS_PER_DAY` and `MAX_KM_PER_DAY`. Proposal from the 2025 reference: 3 stops, 80 km. Used to bound the search and define "implausible."
2. **`SeatCount` "4+1"** written verbatim into the workbook seats cell? (Assuming yes.)
3. **Weekly Architect/Constructor visits** — now soft (the fuel target dominates). Confirm they can be dropped entirely if fuel-balancing doesn't need them, or kept as a soft preference.

> These can be carried as explicit defaults in `TASKS.md` and refined; only the `TripGenerator` core task depends on #1.