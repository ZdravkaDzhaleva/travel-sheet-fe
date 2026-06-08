import { Injectable } from '@angular/core';
import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type User,
  type UserCredential,
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

const FIREBASE_OAUTH_TOKEN_LIFETIME_S = 3600;

// Hard ceiling on the silent GIS request. Without this, if the browser blocks
// the popup or the origin isn't authorized for the GIS client, the callback
// never fires and the entire load chain stalls indefinitely.
const GIS_TOKEN_REQUEST_TIMEOUT_MS = 20_000;

// Survives the round-trip to Google and back: set before signInWithRedirect,
// read on the return load so the sign-in screen knows to collect the result.
const REDIRECT_PENDING_KEY = 'ts:auth-redirect-pending';

declare global {
  interface Window {
    google?: GisNamespace;
  }
}

/**
 * True for iOS/Android browsers. On iOS every browser is WebKit, whose ITP
 * severs the cross-origin channel signInWithPopup needs — the popup opens,
 * Google completes, then it closes with no result and no error. Those browsers
 * use the redirect flow instead.
 */
function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as desktop Safari; touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return iOS || /android/i.test(ua);
}

function readRedirectPending(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(REDIRECT_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

function writeRedirectPending(pending: boolean): void {
  try {
    const store = globalThis.sessionStorage;
    if (!store) return;
    if (pending) store.setItem(REDIRECT_PENDING_KEY, '1');
    else store.removeItem(REDIRECT_PENDING_KEY);
  } catch {
    // Private mode or storage disabled — degrade silently.
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

  /**
   * Starts Google sign-in. On desktop this resolves to the signed-in `User`
   * via a popup. On mobile (iOS/Android WebKit, where popups die under ITP) it
   * triggers a full-page redirect and resolves to `null` — the page unloads,
   * and the result is collected by {@link completeRedirectSignIn} on return.
   */
  async signInWithGoogle(): Promise<User | null> {
    const provider = new GoogleAuthProvider();
    for (const scope of OAUTH_SCOPES) provider.addScope(scope);

    if (isMobileBrowser()) {
      writeRedirectPending(true);
      await signInWithRedirect(firebaseAuth, provider);
      return null;
    }

    const credential = await signInWithPopup(firebaseAuth, provider);
    this.cacheCredential(credential);
    return credential.user;
  }

  /** True when a sign-in redirect is in flight and its result is still pending. */
  hasPendingRedirect(): boolean {
    return readRedirectPending();
  }

  /**
   * Collects the result of a sign-in redirect after the browser returns to the
   * app. Caches the OAuth access token and returns the signed-in `User`, or
   * `null` when there is no pending redirect result.
   */
  async completeRedirectSignIn(): Promise<User | null> {
    try {
      const credential = await getRedirectResult(firebaseAuth);
      if (!credential) return null;
      this.cacheCredential(credential);
      return credential.user;
    } finally {
      writeRedirectPending(false);
    }
  }

  /**
   * Firebase's sign-in result already carries a usable Google OAuth access
   * token for the requested scopes. Cache it so the rest of the session can
   * call Sheets/Drive directly without re-running the GIS flow (which would
   * need its own consent for the GIS client_id and a user gesture).
   */
  private cacheCredential(credential: UserCredential): void {
    const oauth = GoogleAuthProvider.credentialFromResult(credential);
    if (oauth?.accessToken) {
      this.cachedToken = buildCachedToken(
        {
          access_token: oauth.accessToken,
          expires_in: FIREBASE_OAUTH_TOKEN_LIFETIME_S,
        },
        Date.now(),
      );
    }
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

  /**
   * Drops the cached token and forces a fresh interactive token request with the
   * Google consent prompt. Use to recover from a silent (empty-prompt) GIS
   * failure — ungranted scopes, an unauthorized origin, or a stalled session.
   * On success the token is cached, so the subsequent data loads reuse it
   * without re-prompting (and without racing parallel GIS requests).
   */
  async reauthorize(): Promise<void> {
    this.cachedToken = null;
    await this.requestNewToken('consent');
  }

  private requestNewToken(prompt: string): Promise<string> {
    const client = this.getTokenClient();
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new GoogleAuthError(
            `Google Identity Services did not respond within ${GIS_TOKEN_REQUEST_TIMEOUT_MS} ms — ` +
              `verify that ${window.location.origin} is in the OAuth client's Authorized JavaScript origins ` +
              `and that the user has granted the required scopes.`,
          ),
        );
      }, GIS_TOKEN_REQUEST_TIMEOUT_MS);

      client.callback = resp => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
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
