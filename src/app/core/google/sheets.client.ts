import { Injectable, inject } from '@angular/core';

import { GoogleAuth } from '../auth/google-auth';
import { googleFetch } from './google-http';

export type SheetCellValue = string | number | boolean | null;

export interface ValuesGetResponse {
  readonly range: string;
  readonly majorDimension: 'ROWS' | 'COLUMNS';
  readonly values?: readonly (readonly SheetCellValue[])[];
}

export interface ValuesUpdateResponse {
  readonly spreadsheetId: string;
  readonly updatedRange: string;
  readonly updatedRows: number;
  readonly updatedColumns: number;
  readonly updatedCells: number;
}

export type SheetsBatchRequest = Readonly<Record<string, unknown>>;

export interface BatchUpdateResponse {
  readonly spreadsheetId: string;
  readonly replies?: readonly unknown[];
}

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

@Injectable({ providedIn: 'root' })
export class SheetsClient {
  private readonly auth = inject(GoogleAuth);

  async valuesGet(
    spreadsheetId: string,
    range: string,
  ): Promise<ValuesGetResponse> {
    const token = await this.auth.getAccessToken();
    const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
    return googleFetch<ValuesGetResponse>(url, { method: 'GET' }, token);
  }

  async valuesUpdate(
    spreadsheetId: string,
    range: string,
    values: readonly (readonly SheetCellValue[])[],
  ): Promise<ValuesUpdateResponse> {
    const token = await this.auth.getAccessToken();
    const url =
      `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}` +
      `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    return googleFetch<ValuesUpdateResponse>(
      url,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      },
      token,
    );
  }

  async batchUpdate(
    spreadsheetId: string,
    requests: readonly SheetsBatchRequest[],
  ): Promise<BatchUpdateResponse> {
    const token = await this.auth.getAccessToken();
    const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
    return googleFetch<BatchUpdateResponse>(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      },
      token,
    );
  }
}
