import { Injectable, inject } from '@angular/core';

import { DriveClient } from '../core/google/drive.client';
import { DRIVE_FOLDER_NAME } from '../core/config/workspace.config';
import { DriveFolderNotFoundError } from './drive-store.errors';

const MIME_FOLDER = 'application/vnd.google-apps.folder';

/** Identifier of a file in Google Drive (matches Invoice.DriveFileId). */
export type DriveFileId = string;

@Injectable({ providedIn: 'root' })
export class DriveStore {
  private readonly drive = inject(DriveClient);
  private folderIdPromise: Promise<string> | null = null;

  /**
   * Uploads an invoice file to the configured Drive folder and returns the new file's ID.
   * `name` overrides the on-Drive file name; when omitted, falls back to `file.name`
   * (for File instances) or "invoice".
   */
  async uploadInvoice(file: Blob, name?: string): Promise<DriveFileId> {
    const folderId = await this.resolveFolderId();
    const created = await this.drive.createFile(
      {
        name: name ?? (file instanceof File ? file.name : 'invoice'),
        mimeType: file.type || undefined,
        parents: [folderId],
      },
      file,
    );
    return created.id;
  }

  private resolveFolderId(): Promise<string> {
    if (!this.folderIdPromise) {
      this.folderIdPromise = this.lookupFolderId();
    }
    return this.folderIdPromise;
  }

  private async lookupFolderId(): Promise<string> {
    const folder = await this.drive.findByName(DRIVE_FOLDER_NAME, {
      mimeType: MIME_FOLDER,
    });
    if (!folder) {
      throw new DriveFolderNotFoundError(DRIVE_FOLDER_NAME);
    }
    return folder.id;
  }
}
