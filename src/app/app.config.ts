import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

import { environment } from '../environments/environment';
import { routes } from './app.routes';

// Initialize Firebase once at bootstrap. The Auth instance is used by
// core/auth (T3.1); keeping initialization here keeps app.config as the
// single bootstrap entry point.
export const firebaseApp = initializeApp(environment.firebase);
export const firebaseAuth = getAuth(firebaseApp);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
  ],
};
