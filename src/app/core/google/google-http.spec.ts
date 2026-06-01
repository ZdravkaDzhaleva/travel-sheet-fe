import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { googleFetch, GoogleApiError } from './google-http';

describe('googleFetch', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  function mockResponse(status: number, body: unknown): Response {
    return new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  it('sets Authorization: Bearer <token> header', async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, { ok: true }));
    await googleFetch<{ ok: true }>('https://example/api', { method: 'GET' }, 'tok-1');
    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer tok-1');
  });

  it('returns parsed JSON on 2xx', async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, { a: 1 }));
    const out = await googleFetch<{ a: number }>('https://x', { method: 'GET' }, 't');
    expect(out).toEqual({ a: 1 });
  });

  it('preserves caller headers and merges Authorization', async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, {}));
    await googleFetch(
      'https://x',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      't',
    );
    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer t');
  });

  it('throws GoogleApiError carrying status / url / body on non-2xx', async () => {
    fetchSpy.mockResolvedValue(mockResponse(403, 'forbidden text'));
    let caught: unknown;
    try {
      await googleFetch('https://x/forbidden', { method: 'GET' }, 't');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GoogleApiError);
    const err = caught as GoogleApiError;
    expect(err.status).toBe(403);
    expect(err.url).toBe('https://x/forbidden');
    expect(err.body).toBe('forbidden text');
  });

  it('truncates very long bodies in the error message', async () => {
    const longBody = 'x'.repeat(500);
    fetchSpy.mockResolvedValue(mockResponse(500, longBody));
    try {
      await googleFetch('https://x', { method: 'GET' }, 't');
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as GoogleApiError;
      expect(err.body).toHaveLength(500); // full body retained
      expect(err.message).toContain('…');  // message is truncated
    }
  });
});
