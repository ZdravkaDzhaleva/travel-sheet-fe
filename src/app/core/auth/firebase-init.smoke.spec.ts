import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

import { FIREBASE_APP, FIREBASE_AUTH, provideFirebase } from './firebase.providers';

function setup(): { app: ReturnType<typeof getApp>; auth: ReturnType<typeof getAuth> } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [...provideFirebase()] });
  return {
    app: TestBed.inject(FIREBASE_APP),
    auth: TestBed.inject(FIREBASE_AUTH),
  };
}

describe('Firebase initialization (via DI)', () => {
  it('initializes a Firebase app', () => {
    const { app } = setup();
    expect(app).toBeDefined();
    expect(app.name).toBe('[DEFAULT]');
  });

  it('getApp() returns the same app instance', () => {
    const { app } = setup();
    expect(getApp()).toBe(app);
  });

  it('initializes Firebase Auth', () => {
    const { auth } = setup();
    expect(auth).toBeDefined();
  });

  it('getAuth() returns the same auth instance', () => {
    const { app, auth } = setup();
    expect(getAuth(app)).toBe(auth);
  });

  it('auth is associated with the correct app', () => {
    const { app, auth } = setup();
    expect(auth.app).toBe(app);
  });
});
