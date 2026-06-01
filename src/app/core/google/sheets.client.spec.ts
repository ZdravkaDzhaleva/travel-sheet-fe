import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SheetsClient } from './sheets.client';
import { GoogleAuth } from '../auth/google-auth';
import { GoogleApiError } from './google-http';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeClient(token = 'tok-1'): SheetsClient {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: GoogleAuth,
        useValue: { getAccessToken: () => Promise.resolve(token) },
      },
    ],
  });
  return TestBed.inject(SheetsClient);
}

describe('SheetsClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  describe('valuesGet', () => {
    it('issues GET to the v4 endpoint with encoded ids and range', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse(200, { range: 'A1:B2', majorDimension: 'ROWS', values: [['a']] }),
      );
      const client = makeClient();
      await client.valuesGet('spreadsheet-id', 'Sheet 1!A1:B2');
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        'https://sheets.googleapis.com/v4/spreadsheets/spreadsheet-id/values/Sheet%201!A1%3AB2',
      );
      expect(init?.method).toBe('GET');
    });

    it('sends the access token from GoogleAuth', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(200, {}));
      const client = makeClient('access-xyz');
      await client.valuesGet('s', 'A1');
      const [, init] = fetchSpy.mock.calls[0];
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-xyz');
    });

    it('returns the parsed response on success', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse(200, {
          range: 'A1:B1',
          majorDimension: 'ROWS',
          values: [['x', 'y']],
        }),
      );
      const client = makeClient();
      const res = await client.valuesGet('s', 'A1:B1');
      expect(res.range).toBe('A1:B1');
      expect(res.values).toEqual([['x', 'y']]);
    });

    it('throws GoogleApiError on non-2xx', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(404, { error: 'not found' }));
      const client = makeClient();
      await expect(client.valuesGet('s', 'A1')).rejects.toBeInstanceOf(GoogleApiError);
    });
  });

  describe('valuesUpdate', () => {
    it('issues PUT with USER_ENTERED and JSON body { values }', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse(200, {
          spreadsheetId: 's',
          updatedRange: 'A1',
          updatedRows: 1,
          updatedColumns: 1,
          updatedCells: 1,
        }),
      );
      const client = makeClient();
      const values = [[1, 'x', true]];
      await client.valuesUpdate('s', 'A1', values);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        'https://sheets.googleapis.com/v4/spreadsheets/s/values/A1?valueInputOption=USER_ENTERED',
      );
      expect(init?.method).toBe('PUT');
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
      expect(JSON.parse(init?.body as string)).toEqual({ values });
    });
  });

  describe('batchUpdate', () => {
    it('POSTs requests array to the :batchUpdate endpoint', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(200, { spreadsheetId: 's' }));
      const client = makeClient();
      const requests = [{ addSheet: { properties: { title: 'New' } } }];
      await client.batchUpdate('s', requests);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        'https://sheets.googleapis.com/v4/spreadsheets/s:batchUpdate',
      );
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({ requests });
    });
  });

  describe('valuesAppend', () => {
    it('POSTs to /values/{range}:append with USER_ENTERED and a {values} body', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse(200, { spreadsheetId: 's', updates: { updatedRows: 1 } }),
      );
      const client = makeClient();
      const values = [[1, 'a']];
      await client.valuesAppend('s', 'Invoice!A:K', values);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        'https://sheets.googleapis.com/v4/spreadsheets/s/values/Invoice!A%3AK:append?valueInputOption=USER_ENTERED',
      );
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({ values });
    });
  });

  describe('getSpreadsheet', () => {
    it('GETs the spreadsheet metadata with a partial-response fields filter', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse(200, {
          spreadsheetId: 's',
          sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }],
        }),
      );
      const client = makeClient();
      const res = await client.getSpreadsheet('s');
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        'https://sheets.googleapis.com/v4/spreadsheets/s?fields=spreadsheetId,sheets.properties(sheetId,title)',
      );
      expect(init?.method).toBe('GET');
      expect(res.sheets[0].properties.title).toBe('Sheet1');
    });
  });
});
