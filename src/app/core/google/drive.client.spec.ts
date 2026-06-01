import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DriveClient, buildMultipartBody } from './drive.client';
import { GoogleAuth } from '../auth/google-auth';
import { GoogleApiError } from './google-http';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeClient(token = 'tok-1'): DriveClient {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: GoogleAuth,
        useValue: { getAccessToken: () => Promise.resolve(token) },
      },
    ],
  });
  return TestBed.inject(DriveClient);
}

describe('DriveClient.createFile', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('POSTs to the multipart upload endpoint with Authorization header', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, { id: 'file-1', name: 'a.pdf', mimeType: 'application/pdf' }),
    );
    const client = makeClient('access-xyz');
    await client.createFile({ name: 'a.pdf' }, new Blob(['hello']));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,kind',
    );
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-xyz');
    expect(headers.get('Content-Type')).toMatch(/^multipart\/related; boundary=/);
  });

  it('returns the parsed DriveFile on success', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, { id: 'file-1', name: 'a.pdf', mimeType: 'application/pdf' }),
    );
    const out = await makeClient().createFile({ name: 'a.pdf' }, new Blob(['x']));
    expect(out.id).toBe('file-1');
    expect(out.name).toBe('a.pdf');
  });

  it('throws GoogleApiError on non-2xx', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(401, { error: 'unauth' }));
    await expect(
      makeClient().createFile({ name: 'a.pdf' }, new Blob(['x'])),
    ).rejects.toBeInstanceOf(GoogleApiError);
  });
});

describe('buildMultipartBody', () => {
  async function readBody(b: Blob): Promise<string> {
    return await b.text();
  }

  it('includes a JSON metadata part and a content part separated by the boundary', async () => {
    const body = buildMultipartBody(
      { name: 'a.pdf', parents: ['folder-1'] },
      new Blob(['HELLO'], { type: 'text/plain' }),
      'BND',
    );
    const text = await readBody(body);
    expect(text).toContain('--BND\r\n');
    expect(text).toContain('Content-Type: application/json; charset=UTF-8');
    expect(text).toContain('"name":"a.pdf"');
    expect(text).toContain('"parents":["folder-1"]');
    expect(text).toContain('Content-Type: text/plain');
    expect(text).toContain('HELLO');
    expect(text).toContain('--BND--');
  });

  it('falls back to application/octet-stream when the blob has no type', async () => {
    const body = buildMultipartBody(
      { name: 'x' },
      new Blob(['DATA']),
      'BND',
    );
    const text = await readBody(body);
    expect(text).toContain('Content-Type: application/octet-stream');
  });
});
