# Travel Sheet App — Claude Code guide

Single-user Angular POC that generates one month of a Bulgarian travel sheet ("Пътен лист") into a Google Sheets workbook, from data in a supporting spreadsheet. Stack: Angular (v21, Vitest) + Firebase + Google Sheets/Drive, client-side only.

## Read these when relevant (don't preload)
- `docs/TASKS.md` — before starting a task, read that task's entry. Work one task at a time, in dependency order.
- `docs/ARCHITECTURE.md` — read the relevant section before implementing: §6 (workbook template/RowMapper), §6a (supporting-sheet schema), §6b (trip-generation rules + opening balance), §7a (holiday-API hardening), §8 (testing).
- `docs/CONVENTIONS.md` — skim once per session before writing code (naming, numbers, Cyrillic constants, color tokens, commits).

## Session workflow
- Confirm the task and its deps in `TASKS.md` before coding.
- Implement only that task's scope. Cover its "Done when" criteria with tests (Vitest) before considering it done.
- When finished, mark the task `[x]` in `TASKS.md` with a one-line note.
- Commit format: `<type>(<scope>): <summary> [T<id>]` (Conventional Commits + task ID).

## Non-negotiables (always apply)
- **Domain purity:** nothing in `domain/` may import Angular, Firebase, Google, or any I/O. All I/O lives in `infrastructure/`/`application/`, which pass plain data into pure domain functions. (ESLint enforces this.)
- **Fuel balance:** generated month's closing balance must be within [0, 8] liters and never negative on any row. Use the `BALANCE_MIN`/`BALANCE_MAX` config constants, not literals.
- **Fuel events are fixed; trips are not.** Fuel rows come verbatim from invoice metadata on their real dates; trip rows may vary between runs (no determinism requirement).
- **Workbook is write-only, with one exception:** the only permitted read-back is the previous month's closing balance for carry-forward (ARCHITECTURE §6b).
- **Secrets:** never commit Google OAuth client secrets or service-account keys. (Firebase web config is not secret.)
- **Cyrillic:** every workbook string is a named constant in `core/config/workbook.template.ts` — no Cyrillic literals in logic.

## Commands
- Dev: `ng serve` · Test: `ng test` (Vitest) · Lint: `ng lint` · Build: `ng build`
- Lint + format + tests must pass before merge (enforced in CI).
