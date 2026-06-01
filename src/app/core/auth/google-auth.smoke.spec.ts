import { describe, it, expect } from 'vitest';
import { GoogleAuth } from './google-auth';
import { GoogleAuthError } from './google-auth.types';

describe('GoogleAuth — smoke', () => {
  it('constructs without throwing', () => {
    expect(() => new GoogleAuth()).not.toThrow();
  });

  it('exposes signInWithGoogle, signOut, and getAccessToken', () => {
    const auth = new GoogleAuth();
    expect(typeof auth.signInWithGoogle).toBe('function');
    expect(typeof auth.signOut).toBe('function');
    expect(typeof auth.getAccessToken).toBe('function');
  });

  it('rejects getAccessToken with a typed error when GIS script is not loaded', async () => {
    // jsdom test environment has no window.google injected — this exercises the
    // "GIS not loaded" branch and verifies we surface a typed GoogleAuthError.
    const auth = new GoogleAuth();
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(GoogleAuthError);
  });
});
