import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { DriveStore } from './drive.store';
import { DriveFolderNotFoundError } from './drive-store.errors';
import { DriveClient, type DriveFile, type DriveFileMetadata } from '../core/google/drive.client';

interface DriveStubState {
  readonly created: { metadata: DriveFileMetadata; content: Blob }[];
  folder: DriveFile | null;
  nextFileId: string;
}

function makeDriveStub(opts: Partial<DriveStubState> = {}): {
  client: DriveClient;
  state: DriveStubState;
  findByNameSpy: ReturnType<typeof vi.fn>;
} {
  const state: DriveStubState = {
    created: [],
    folder: opts.folder !== undefined
      ? opts.folder
      : { id: 'folder-1', name: 'FILL_ME_DRIVE_FOLDER_NAME', mimeType: 'application/vnd.google-apps.folder' },
    nextFileId: opts.nextFileId ?? 'new-file-id',
  };
  const findByNameSpy = vi.fn(async () => state.folder);
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
