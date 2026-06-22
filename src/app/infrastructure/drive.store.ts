import { Injectable, inject } from '@angular/core';

import { DriveClient } from '../core/google/drive.client';
import { GoogleApiError } from '../core/google/google-http';
import { DRIVE_FOLDER_NAME } from '../core/config/workspace.config';
import { DriveFolderNotFoundError } from './drive-store.errors';

const MIME_FOLDER = 'application/vnd.google-apps.folder';
const MIME_PDF = 'application/pdf';
const DRIVE_FILE_VIEW_BASE = 'https://drive.google.com/file/d';

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

  /**
   * Saves a PDF blob to the configured Drive folder as `filename`.
   * If a non-trashed file with the same name already exists in the folder,
   * its content is replaced in-place (no duplicate). Otherwise a new file is created.
   * Returns the Drive web URL (`https://drive.google.com/file/d/{id}/view`).
   */
  async savePdfToFolder(blob: Blob, filename: string): Promise<string> {
    const folderId = await this.resolveFolderId();
    const existing = await this.drive.findByName(filename, {
      mimeType: MIME_PDF,
      parentId: folderId,
    });
    const fileId = existing
      ? (await this.drive.updateFileContent(existing.id, blob)).id
      : (await this.drive.createFile(
          { name: filename, mimeType: MIME_PDF, parents: [folderId] },
          blob,
        )).id;
    return `${DRIVE_FILE_VIEW_BASE}/${encodeURIComponent(fileId)}/view`;
  }

  /**
   * Moves an invoice file to Drive trash. A file that is already gone (404) is
   * treated as success; any other Drive error is rethrown.
   */
  async trashInvoiceFile(fileId: DriveFileId): Promise<void> {
    try {
      await this.drive.trashFile(fileId);
    } catch (err) {
      if (err instanceof GoogleApiError && err.status === 404) return;
      throw err;
    }
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
