/** Thrown by DriveStore when the configured upload folder can't be located in Drive. */
export class DriveFolderNotFoundError extends Error {
  constructor(folderName: string) {
    super(`Drive folder "${folderName}" not found — create it before uploading invoices`);
    this.name = 'DriveFolderNotFoundError';
  }
}
