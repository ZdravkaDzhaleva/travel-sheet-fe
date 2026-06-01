/** Thrown by SheetsStore when the configured workbook can't be located in Drive. */
export class WorkbookNotFoundError extends Error {
  constructor(workbookName: string, folderName: string | null) {
    const where = folderName ? `inside folder "${folderName}"` : 'in Drive';
    super(`Workbook "${workbookName}" not found ${where} — create it before generating`);
    this.name = 'WorkbookNotFoundError';
  }
}

/** Thrown when a row from the supporting sheet can't be parsed into a typed entity. */
export class MasterDataParseError extends Error {
  constructor(entity: string, rowIndex: number, reason: string) {
    super(`Failed to parse ${entity} row ${rowIndex}: ${reason}`);
    this.name = 'MasterDataParseError';
  }
}
