import { describe, it, expect } from 'vitest';
import {
  buildCachedToken,
  isCachedTokenValid,
  EXPIRY_SAFETY_MARGIN_SECONDS,
} from './token-cache';
import type { GisTokenResponse } from './google-auth.types';

const baseResp: GisTokenResponse = {
  access_token: 'tok-abc',
  expires_in: 3600,
};

describe('buildCachedToken', () => {
  it('stores the access token verbatim', () => {
    const t = buildCachedToken(baseResp, 0);
    expect(t.accessToken).toBe('tok-abc');
  });

  it('subtracts EXPIRY_SAFETY_MARGIN_SECONDS from the lifetime', () => {
    const now = 1_000_000;
    const t = buildCachedToken(baseResp, now);
    const expected = now + (3600 - EXPIRY_SAFETY_MARGIN_SECONDS) * 1000;
    expect(t.expiresAt).toBe(expected);
  });

  it('clamps expiry to now when expires_in is at or below the safety margin', () => {
    const now = 5000;
    const t = buildCachedToken(
      { access_token: 'x', expires_in: EXPIRY_SAFETY_MARGIN_SECONDS },
      now,
    );
    expect(t.expiresAt).toBe(now);
  });

  it('still clamps when expires_in is below the safety margin (no negative lifetime)', () => {
    const t = buildCachedToken({ access_token: 'x', expires_in: 10 }, 1000);
    expect(t.expiresAt).toBe(1000);
  });
});

describe('isCachedTokenValid', () => {
  it('returns false for null', () => {
    expect(isCachedTokenValid(null, 0)).toBe(false);
  });

  it('returns true while now is before expiresAt', () => {
    expect(isCachedTokenValid({ accessToken: 't', expiresAt: 1000 }, 999)).toBe(true);
  });

  it('returns false at the expiresAt boundary', () => {
    expect(isCachedTokenValid({ accessToken: 't', expiresAt: 1000 }, 1000)).toBe(false);
  });

  it('returns false after expiry', () => {
    expect(isCachedTokenValid({ accessToken: 't', expiresAt: 1000 }, 1001)).toBe(false);
  });
});
