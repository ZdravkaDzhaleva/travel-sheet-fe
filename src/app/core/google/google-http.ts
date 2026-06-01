/** Thrown for any non-2xx response from a Google API call. */
export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`Google API ${status} for ${url}: ${truncate(body, 200)}`);
    this.name = 'GoogleApiError';
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…';
}

/**
 * Issues an authenticated fetch against a Google API and parses the JSON response.
 * Throws GoogleApiError on any non-2xx response.
 */
export async function googleFetch<T>(
  url: string,
  init: RequestInit,
  accessToken: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const resp = await fetch(url, { ...init, headers });
  if (!resp.ok) {
    const body = await safeText(resp);
    throw new GoogleApiError(resp.status, url, body);
  }
  return (await resp.json()) as T;
}

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}
