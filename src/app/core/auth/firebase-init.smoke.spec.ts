import { describe, it, expect } from 'vitest';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Importing app.config triggers initializeApp + getAuth at module load time.
import { firebaseApp, firebaseAuth } from '../../app.config';

describe('Firebase initialization', () => {
  it('initializes a Firebase app', () => {
    expect(firebaseApp).toBeDefined();
    expect(firebaseApp.name).toBe('[DEFAULT]');
  });

  it('getApp() returns the same app instance', () => {
    expect(getApp()).toBe(firebaseApp);
  });

  it('initializes Firebase Auth', () => {
    expect(firebaseAuth).toBeDefined();
  });

  it('getAuth() returns the same auth instance', () => {
    expect(getAuth(firebaseApp)).toBe(firebaseAuth);
  });

  it('auth is associated with the correct app', () => {
    expect(firebaseAuth.app).toBe(firebaseApp);
  });
});
