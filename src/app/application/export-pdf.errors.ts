/** The selected м_MM tab no longer exists in the workbook when export is attempted. */
export class SheetNotFoundError extends Error {
  constructor(readonly sheetName: string) {
    super(`Sheet "${sheetName}" was not found in the workbook — it may have been deleted`);
    this.name = 'SheetNotFoundError';
  }
}

/** The Google Sheets export endpoint returned a non-2xx response. */
export class ExportFailedError extends Error {
  constructor(
    readonly sheetName: string,
    readonly originalCause: Error,
  ) {
    super(`Failed to export "${sheetName}" as PDF: ${originalCause.message}`);
    this.name = 'ExportFailedError';
  }
}

/** The Drive files.create or files.update call failed when saving the PDF. */
export class DriveWriteFailedError extends Error {
  constructor(
    readonly filename: string,
    readonly originalCause: Error,
  ) {
    super(`Failed to save "${filename}" to Drive: ${originalCause.message}`);
    this.name = 'DriveWriteFailedError';
  }
}
