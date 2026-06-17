import { InjectionToken, type Provider } from '@angular/core';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

import { environment } from '../../../environments/environment';

/** The initialized Firebase app instance. */
export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
/** The Firebase Auth instance bound to {@link FIREBASE_APP}. */
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');

/**
 * DI providers for Firebase. Initialization happens lazily in the factories
 * (not as a module side-effect), so it runs only when something injects these
 * tokens. The app factory is idempotent — it reuses the existing `[DEFAULT]`
 * app if one is already initialized.
 */
export function provideFirebase(): Provider[] {
  return [
    {
      provide: FIREBASE_APP,
      useFactory: (): FirebaseApp =>
        getApps().length ? getApp() : initializeApp(environment.firebase),
    },
    {
      provide: FIREBASE_AUTH,
      useFactory: (app: FirebaseApp): Auth => getAuth(app),
      deps: [FIREBASE_APP],
    },
  ];
}
