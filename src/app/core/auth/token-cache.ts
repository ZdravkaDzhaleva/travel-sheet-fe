import type { CachedAccessToken, GisTokenResponse } from './google-auth.types';

// Subtract a small margin so we refresh slightly before the real expiry to avoid
// in-flight requests racing the boundary.
export const EXPIRY_SAFETY_MARGIN_SECONDS = 60;

/** Builds a CachedAccessToken from a GIS response, applying the safety margin. */
export function buildCachedToken(
  resp: GisTokenResponse,
  now: number,
): CachedAccessToken {
  const lifetimeMs = (resp.expires_in - EXPIRY_SAFETY_MARGIN_SECONDS) * 1000;
  return {
    accessToken: resp.access_token,
    expiresAt: now + Math.max(0, lifetimeMs),
  };
}

/** True if the cache entry is non-null and not yet expired at `now`. */
export function isCachedTokenValid(
  token: CachedAccessToken | null,
  now: number,
): boolean {
  if (token === null) return false;
  return now < token.expiresAt;
}
