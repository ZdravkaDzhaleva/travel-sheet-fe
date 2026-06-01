// Holiday provider configuration. See ARCHITECTURE §7a for hardening rules.

// HTTPS host is pinned — HolidayProvider must reject any other origin.
export const HOLIDAY_API_HOST     = 'https://date.nager.at';
export const HOLIDAY_API_TEMPLATE = `${HOLIDAY_API_HOST}/api/v3/PublicHolidays/{year}/BG`;

export const HOLIDAY_API_TIMEOUT_MS  = 5_000;
export const HOLIDAY_MAX_ENTRIES     = 60;   // payload bound per §7a rule 4

// Tab in the supporting spreadsheet that holds the manual holiday override list.
export const HOLIDAY_OVERRIDE_TAB = 'HolidayOverrides';
