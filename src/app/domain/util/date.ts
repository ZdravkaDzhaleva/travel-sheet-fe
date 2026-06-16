/**
 * Calendar-date ⇄ string helpers. Dates are treated as timezone-agnostic
 * calendar dates (local parts only) per CONVENTIONS §4a — never round-trip
 * through UTC / `toISOString()`, which can roll the date back a day.
 */

/** `YYYY-MM-DD` → local Date (avoids the UTC-midnight roll-back from `new Date('YYYY-MM-DD')`). */
export function parseDateInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/** Date → `YYYY-MM-DD` (local parts, for `<input type="date">`). */
export function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Date → `DD.MM.YYYY` (local parts, for display). */
export function formatDateDisplay(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${m}.${d.getFullYear()}`;
}
