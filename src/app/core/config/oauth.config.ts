// Google OAuth scopes required by the app (least-privilege, per ARCHITECTURE §4).

export const OAUTH_SCOPES: readonly string[] = [
  'https://www.googleapis.com/auth/spreadsheets', // read supporting sheet + write workbook
  'https://www.googleapis.com/auth/drive.file',   // upload/manage invoice files in Drive
];
