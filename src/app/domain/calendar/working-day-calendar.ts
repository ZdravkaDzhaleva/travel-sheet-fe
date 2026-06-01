/** Returns all Mon–Fri dates in the given month, excluding any supplied holiday dates. */
export function workingDaysInMonth(
  year: number,
  month: number,
  holidays: Date[],
): Date[] {
  const holidayKeys = new Set(holidays.map(toDateKey));

  const days: Date[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay(); // 0 = Sun, 6 = Sat
    if (dow === 0 || dow === 6) continue;
    if (holidayKeys.has(toDateKey(date))) continue;
    days.push(date);
  }

  return days;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
