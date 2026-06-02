// Google OAuth scopes required by the app (least-privilege, per ARCHITECTURE §4).

export const OAUTH_SCOPES: readonly string[] = [
  'https://www.googleapis.com/auth/spreadsheets',           // read supporting sheet + write workbook
  'https://www.googleapis.com/auth/drive.file',             // create/manage invoice files the app uploads
  'https://www.googleapis.com/auth/drive.metadata.readonly', // resolve folder/spreadsheet by name (DriveClient.findByName)
];
