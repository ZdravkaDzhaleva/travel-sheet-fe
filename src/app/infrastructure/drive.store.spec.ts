import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { DriveStore } from './drive.store';
import { DriveFolderNotFoundError } from './drive-store.errors';
import { DriveClient, type DriveFile, type DriveFileMetadata } from '../core/google/drive.client';
import { GoogleApiError } from '../core/google/google-http';
import { DRIVE_FOLDER_NAME } from '../core/config/workspace.config';

interface DriveStubState {
  readonly created: { metadata: DriveFileMetadata; content: Blob }[];
  readonly updated: { fileId: string; content: Blob }[];
  folder: DriveFile | null;
  /** Returned by findByName for any name that is NOT the Drive folder name. */
  existingPdf: DriveFile | null;
  nextFileId: string;
}

function makeDriveStub(opts: Partial<DriveStubState> = {}): {
  client: DriveClient;
  state: DriveStubState;
  findByNameSpy: ReturnType<typeof vi.fn>;
} {
  const state: DriveStubState = {
    created: [],
    updated: [],
    folder: opts.folder !== undefined
      ? opts.folder
      : { id: 'folder-1', name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    existingPdf: opts.existingPdf ?? null,
    nextFileId: opts.nextFileId ?? 'new-file-id',
  };
  const findByNameSpy = vi.fn(async (name: string) =>
    name === DRIVE_FOLDER_NAME ? state.folder : state.existingPdf,
  );
  const client = {
    findByName: findByNameSpy,
    createFile: vi.fn(async (metadata: DriveFileMetadata, content: Blob) => {
      state.created.push({ metadata, content });
      return {
        id: state.nextFileId,
        name: metadata.name,
        mimeType: metadata.mimeType ?? 'application/octet-stream',
      };
    }),
    updateFileContent: vi.fn(async (fileId: string, content: Blob) => {
      state.updated.push({ fileId, content });
      return { id: fileId, name: 'updated.pdf', mimeType: 'application/pdf' };
    }),
  } as unknown as DriveClient;
  return { client, state, findByNameSpy };
}

function makeStore(client: DriveClient): DriveStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: DriveClient, useValue: client }],
  });
  return TestBed.inject(DriveStore);
}

describe('DriveStore.uploadInvoice', () => {
  it('returns the new file ID on success', async () => {
    const { client } = makeDriveStub({ nextFileId: 'drive-file-XYZ' });
    const store = makeStore(client);
    const id = await store.uploadInvoice(new Blob(['x']), 'inv.pdf');
    expect(id).toBe('drive-file-XYZ');
  });

  it('places the file in the configured Drive folder via parents=[folderId]', async () => {
    const { client, state } = makeDriveStub();
    const store = makeStore(client);
    await store.uploadInvoice(new Blob(['x']), 'inv.pdf');
    expect(state.created).toHaveLength(1);
    expect(state.created[0].metadata.parents).toEqual(['folder-1']);
  });

  it('uses the provided name when supplied', async () => {
    const { client, state } = makeDriveStub();
    const store = makeStore(client);
    await store.uploadInvoice(new Blob(['x']), 'override.pdf');
    expect(state.created[0].metadata.name).toBe('override.pdf');
  });

  it('falls back to file.name for File instances when name is omitted', async () => {
    const { client, state } = makeDriveStub();
    const store = makeStore(client);
    // File extends Blob with a name.
    const file = new File(['x'], 'original.pdf', { type: 'application/pdf' });
    await store.uploadInvoice(file);
    expect(state.created[0].metadata.name).toBe('original.pdf');
    expect(state.created[0].metadata.mimeType).toBe('application/pdf');
  });

  it('falls back to "invoice" for raw Blobs when no name is given', async () => {
    const { client, state } = makeDriveStub();
    const store = makeStore(client);
    await store.uploadInvoice(new Blob(['x']));
    expect(state.created[0].metadata.name).toBe('invoice');
  });

  it('omits mimeType when the blob has no type rather than sending empty string', async () => {
    const { client, state } = makeDriveStub();
    const store = makeStore(client);
    await store.uploadInvoice(new Blob(['x']), 'x.bin');
    expect(state.created[0].metadata.mimeType).toBeUndefined();
  });

  it('throws DriveFolderNotFoundError when the folder cannot be located', async () => {
    const { client } = makeDriveStub({ folder: null });
    const store = makeStore(client);
    await expect(store.uploadInvoice(new Blob(['x']), 'x.pdf')).rejects.toBeInstanceOf(
      DriveFolderNotFoundError,
    );
  });

  it('looks up the folder only once across multiple uploads', async () => {
    const { client, findByNameSpy } = makeDriveStub();
    const store = makeStore(client);
    await store.uploadInvoice(new Blob(['a']), 'a.pdf');
    await store.uploadInvoice(new Blob(['b']), 'b.pdf');
    expect(findByNameSpy).toHaveBeenCalledTimes(1);
  });
});

describe('DriveStore.trashInvoiceFile', () => {
  function makeTrashStub(trashFile: ReturnType<typeof vi.fn>): DriveClient {
    return { trashFile } as unknown as DriveClient;
  }

  it('delegates to DriveClient.trashFile with the given id', async () => {
    const trashFile = vi.fn(async () => undefined);
    const store = makeStore(makeTrashStub(trashFile));
    await store.trashInvoiceFile('file-1');
    expect(trashFile).toHaveBeenCalledWith('file-1');
  });

  it('treats a 404 (file already gone) as success', async () => {
    const trashFile = vi.fn(async () => {
      throw new GoogleApiError(404, 'url', 'not found');
    });
    const store = makeStore(makeTrashStub(trashFile));
    await expect(store.trashInvoiceFile('gone')).resolves.toBeUndefined();
  });

  it('rethrows non-404 Drive errors', async () => {
    const trashFile = vi.fn(async () => {
      throw new GoogleApiError(500, 'url', 'boom');
    });
    const store = makeStore(makeTrashStub(trashFile));
    await expect(store.trashInvoiceFile('x')).rejects.toBeInstanceOf(GoogleApiError);
  });
});

// ── savePdfToFolder ──────────────────────────────────────────────────────────

describe('DriveStore.savePdfToFolder', () => {
  const PDF_BLOB = new Blob(['%PDF'], { type: 'application/pdf' });
  const FILENAME = 'Pyten_list_2026_01.pdf';

  it('creates a new file when no file with the same name exists in the folder', async () => {
    const { client, state } = makeDriveStub({ nextFileId: 'created-id' });
    const store = makeStore(client);
    await store.savePdfToFolder(PDF_BLOB, FILENAME);
    expect(state.created).toHaveLength(1);
    expect(state.updated).toHaveLength(0);
  });

  it('creates with correct name, mimeType=application/pdf, and parentId=folderId', async () => {
    const { client, state } = makeDriveStub();
    const store = makeStore(client);
    await store.savePdfToFolder(PDF_BLOB, FILENAME);
    expect(state.created[0].metadata.name).toBe(FILENAME);
    expect(state.created[0].metadata.mimeType).toBe('application/pdf');
    expect(state.created[0].metadata.parents).toEqual(['folder-1']);
  });

  it('returns the Drive web URL for the created file', async () => {
    const { client } = makeDriveStub({ nextFileId: 'file-abc' });
    const store = makeStore(client);
    const url = await store.savePdfToFolder(PDF_BLOB, FILENAME);
    expect(url).toBe('https://drive.google.com/file/d/file-abc/view');
  });

  it('updates content in-place when a file with the same name already exists', async () => {
    const existingPdf: DriveFile = { id: 'existing-pdf-id', name: FILENAME, mimeType: 'application/pdf' };
    const { client, state } = makeDriveStub({ existingPdf });
    const store = makeStore(client);
    await store.savePdfToFolder(PDF_BLOB, FILENAME);
    expect(state.updated).toHaveLength(1);
    expect(state.created).toHaveLength(0);
  });

  it('calls updateFileContent with the existing file id', async () => {
    const existingPdf: DriveFile = { id: 'existing-pdf-id', name: FILENAME, mimeType: 'application/pdf' };
    const { client, state } = makeDriveStub({ existingPdf });
    const store = makeStore(client);
    await store.savePdfToFolder(PDF_BLOB, FILENAME);
    expect(state.updated[0].fileId).toBe('existing-pdf-id');
    expect(state.updated[0].content).toBe(PDF_BLOB);
  });

  it('returns the Drive URL using the existing file id on overwrite', async () => {
    const existingPdf: DriveFile = { id: 'existing-pdf-id', name: FILENAME, mimeType: 'application/pdf' };
    const { client } = makeDriveStub({ existingPdf });
    const store = makeStore(client);
    const url = await store.savePdfToFolder(PDF_BLOB, FILENAME);
    expect(url).toBe('https://drive.google.com/file/d/existing-pdf-id/view');
  });

  it('throws DriveFolderNotFoundError when the folder cannot be located', async () => {
    const { client } = makeDriveStub({ folder: null });
    const store = makeStore(client);
    await expect(store.savePdfToFolder(PDF_BLOB, FILENAME)).rejects.toBeInstanceOf(
      DriveFolderNotFoundError,
    );
  });

  it('shares the cached folder id with uploadInvoice — folder looked up only once', async () => {
    const { client, findByNameSpy } = makeDriveStub();
    const store = makeStore(client);
    await store.uploadInvoice(new Blob(['x']), 'inv.pdf');
    await store.savePdfToFolder(PDF_BLOB, FILENAME);
    const folderLookups = (findByNameSpy.mock.calls as string[][]).filter(
      c => c[0] === DRIVE_FOLDER_NAME,
    );
    expect(folderLookups).toHaveLength(1);
  });
});
