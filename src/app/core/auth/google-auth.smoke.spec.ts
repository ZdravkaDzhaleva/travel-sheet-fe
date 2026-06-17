import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { Auth } from 'firebase/auth';

import { GoogleAuth } from './google-auth';
import { GoogleAuthError } from './google-auth.types';
import { FIREBASE_AUTH } from './firebase.providers';

/** GoogleAuth injects FIREBASE_AUTH; these smoke checks don't exercise it, so a
 *  bare stub is enough to construct the service via DI. */
function makeAuth(): GoogleAuth {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: FIREBASE_AUTH, useValue: {} as Auth }],
  });
  return TestBed.inject(GoogleAuth);
}

describe('GoogleAuth — smoke', () => {
  it('constructs without throwing', () => {
    expect(() => makeAuth()).not.toThrow();
  });

  it('exposes signInWithGoogle, signOut, and getAccessToken', () => {
    const auth = makeAuth();
    expect(typeof auth.signInWithGoogle).toBe('function');
    expect(typeof auth.signOut).toBe('function');
    expect(typeof auth.getAccessToken).toBe('function');
  });

  it('rejects getAccessToken with a typed error when GIS script is not loaded', async () => {
    // jsdom test environment has no window.google injected — this exercises the
    // "GIS not loaded" branch and verifies we surface a typed GoogleAuthError.
    const auth = makeAuth();
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(GoogleAuthError);
  });
});
