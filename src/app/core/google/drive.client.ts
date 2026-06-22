import { Injectable, inject } from '@angular/core';

import { GoogleAuth } from '../auth/google-auth';
import { googleFetch } from './google-http';

export interface DriveFileMetadata {
  readonly name: string;
  readonly mimeType?: string;
  readonly parents?: readonly string[];
}

export interface DriveFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly kind?: string;
}

const DRIVE_UPLOAD_URL =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,kind';

const DRIVE_FILES_BASE = 'https://www.googleapis.com/drive/v3/files';

interface DriveFilesListResponse {
  readonly files: readonly DriveFile[];
}

export interface FindByNameOptions {
  readonly parentId?: string;
  readonly mimeType?: string;
}

@Injectable({ providedIn: 'root' })
export class DriveClient {
  private readonly auth = inject(GoogleAuth);

  async createFile(
    metadata: DriveFileMetadata,
    content: Blob,
  ): Promise<DriveFile> {
    const token = await this.auth.getAccessToken();
    const boundary = newBoundary();
    const body = buildMultipartBody(metadata, content, boundary);
    return googleFetch<DriveFile>(
      DRIVE_UPLOAD_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
      token,
    );
  }

  /** Moves the file to Drive trash (recoverable). Throws GoogleApiError on non-2xx. */
  async trashFile(fileId: string): Promise<void> {
    const token = await this.auth.getAccessToken();
    await googleFetch<DriveFile>(
      `${DRIVE_FILES_BASE}/${encodeURIComponent(fileId)}?fields=id`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      },
      token,
    );
  }

  /**
   * Replaces a Drive file's content in-place (metadata unchanged).
   * Uses `uploadType=media` (simple binary upload via PATCH).
   */
  async updateFileContent(fileId: string, content: Blob): Promise<DriveFile> {
    const token = await this.auth.getAccessToken();
    const url =
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}` +
      `?uploadType=media&fields=id,name,mimeType,kind`;
    return googleFetch<DriveFile>(
      url,
      {
        method: 'PATCH',
        headers: { 'Content-Type': content.type || 'application/octet-stream' },
        body: content,
      },
      token,
    );
  }

  /** Returns the first non-trashed file matching `name` (and the optional parent / mime-type), or null. */
  async findByName(
    name: string,
    opts: FindByNameOptions = {},
  ): Promise<DriveFile | null> {
    const token = await this.auth.getAccessToken();
    const url = `${DRIVE_FILES_BASE}?q=${encodeURIComponent(buildFindQuery(name, opts))}` +
      `&fields=files(id,name,mimeType,kind)&pageSize=10`;
    const res = await googleFetch<DriveFilesListResponse>(
      url,
      { method: 'GET' },
      token,
    );
    return res.files.length > 0 ? res.files[0] : null;
  }
}

export function buildFindQuery(
  name: string,
  opts: FindByNameOptions,
): string {
  const esc = name.replace(/'/g, "\\'");
  const parts = [`name = '${esc}'`, 'trashed = false'];
  if (opts.mimeType) parts.push(`mimeType = '${opts.mimeType}'`);
  if (opts.parentId) parts.push(`'${opts.parentId}' in parents`);
  return parts.join(' and ');
}

function newBoundary(): string {
  return '----TravelSheetUpload' + Math.random().toString(36).slice(2);
}

/** Builds a `multipart/related` body with a JSON metadata part and a binary content part. */
export function buildMultipartBody(
  metadata: DriveFileMetadata,
  content: Blob,
  boundary: string,
): Blob {
  const contentType = content.type || 'application/octet-stream';
  return new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${contentType}\r\n\r\n`,
    content,
    `\r\n--${boundary}--`,
  ]);
}
