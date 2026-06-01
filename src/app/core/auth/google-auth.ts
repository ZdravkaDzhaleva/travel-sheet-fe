import { Injectable } from '@angular/core';
import {
  GoogleAuthProvider,
  signInWithPopup,
  type User,
} from 'firebase/auth';

import { firebaseAuth } from '../../app.config';
import { OAUTH_SCOPES } from '../config/oauth.config';
import { environment } from '../../../environments/environment';
import {
  GoogleAuthError,
  type CachedAccessToken,
  type GisNamespace,
  type GisTokenClient,
} from './google-auth.types';
import { buildCachedToken, isCachedTokenValid } from './token-cache';

declare global {
  interface Window {
    google?: GisNamespace;
  }
}

/**
 * Auth service for the app.
 * - signInWithGoogle(): Firebase Auth popup → User object.
 * - getAccessToken(): cached short-lived OAuth access token with the OAUTH_SCOPES.
 *   Silently re-consents (prompt: '') when the cache is empty or expired.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAuth {
  private tokenClient: GisTokenClient | null = null;
  private cachedToken: CachedAccessToken | null = null;

  async signInWithGoogle(): Promise<User> {
    const provider = new GoogleAuthProvider();
    for (const scope of OAUTH_SCOPES) provider.addScope(scope);
    const credential = await signInWithPopup(firebaseAuth, provider);
    return credential.user;
  }

  async signOut(): Promise<void> {
    this.cachedToken = null;
    await firebaseAuth.signOut();
  }

  async getAccessToken(): Promise<string> {
    if (isCachedTokenValid(this.cachedToken, Date.now())) {
      return this.cachedToken!.accessToken;
    }
    return this.requestNewToken('');
  }

  private requestNewToken(prompt: string): Promise<string> {
    const client = this.getTokenClient();
    return new Promise<string>((resolve, reject) => {
      client.callback = resp => {
        if (resp.error) {
          reject(
            new GoogleAuthError(resp.error_description ?? resp.error),
          );
          return;
        }
        this.cachedToken = buildCachedToken(resp, Date.now());
        resolve(resp.access_token);
      };
      client.requestAccessToken({ prompt });
    });
  }

  private getTokenClient(): GisTokenClient {
    if (this.tokenClient) return this.tokenClient;
    const gis = window.google;
    if (!gis?.accounts?.oauth2) {
      throw new GoogleAuthError(
        'Google Identity Services script is not loaded yet — check that gsi/client is included in index.html',
      );
    }
    this.tokenClient = gis.accounts.oauth2.initTokenClient({
      client_id: environment.googleOAuthClientId,
      scope: OAUTH_SCOPES.join(' '),
      callback: () => {
        // Replaced per-request inside requestNewToken().
      },
    });
    return this.tokenClient;
  }
}

export { GoogleAuthError } from './google-auth.types';
