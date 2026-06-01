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
