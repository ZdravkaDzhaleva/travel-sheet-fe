import { Injectable, signal } from '@angular/core';
import { onAuthStateChanged, type Auth, type User } from 'firebase/auth';

import { firebaseAuth } from '../../app.config';

@Injectable({ providedIn: 'root' })
export class AuthState {
  private readonly auth: Auth = firebaseAuth;

  private readonly _user = signal<User | null>(this.auth.currentUser);
  /** Current Firebase user (null when signed out), kept live via the SDK. */
  readonly user = this._user.asReadonly();

  constructor() {
    onAuthStateChanged(this.auth, user => this._user.set(user));
  }

  /**
   * Resolves with the current Firebase user (or null) on the *first* emit of
   * onAuthStateChanged. Firebase persists the session in IndexedDB; on a page
   * reload `currentUser` is briefly null before the SDK rehydrates it, so a
   * one-shot subscription is the correct way to read the post-rehydrate state.
   */
  waitForFirstAuthState(): Promise<User | null> {
    return new Promise(resolve => {
      const unsub = onAuthStateChanged(this.auth, user => {
        unsub();
        resolve(user);
      });
    });
  }
}
