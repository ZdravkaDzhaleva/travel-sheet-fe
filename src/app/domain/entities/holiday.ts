// A public holiday as returned by HolidayProvider.
// WorkingDayCalendar receives holidays as Date[] (dates extracted by the application layer).
export interface Holiday {
  readonly date: Date;
}
