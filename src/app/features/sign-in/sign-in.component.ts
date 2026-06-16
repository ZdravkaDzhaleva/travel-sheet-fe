import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { GoogleAuth } from '../../core/auth/google-auth';

@Component({
  selector: 'app-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.scss',
})
export class SignInComponent implements OnInit {
  private readonly auth = inject(GoogleAuth);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /**
   * On the load that follows a mobile sign-in redirect, collect the result and
   * navigate. `hasPendingRedirect()` is false on every normal load, so this is
   * a no-op for desktop and for direct visits to the sign-in page.
   */
  async ngOnInit(): Promise<void> {
    if (!this.auth.hasPendingRedirect()) return;
    this.busy.set(true);
    try {
      const user = await this.auth.completeRedirectSignIn();
      if (user) await this.router.navigateByUrl('/invoices');
    } catch (err) {
      this.error.set(mapSignInError(err));
    } finally {
      this.busy.set(false);
    }
  }

  async signIn(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.signInWithGoogle();
      if (user) await this.router.navigateByUrl('/invoices');
    } catch (err) {
      this.error.set(mapSignInError(err));
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * Map a raw sign-in failure (Firebase `auth/*` code or a GIS error) to a short,
 * friendly message. Unknown failures fall back to a generic line — we never
 * surface a raw `err.message` to the end user.
 */
export function mapSignInError(err: unknown): string {
  const code = ((err as { code?: unknown })?.code ?? '').toString().toLowerCase();
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const hay = `${code} ${message}`;

  if (hay.includes('popup-blocked') || hay.includes('popup blocked')) {
    return 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.';
  }
  if (
    hay.includes('popup-closed') ||
    hay.includes('cancelled-popup') ||
    hay.includes('canceled-popup') ||
    hay.includes('popup closed') ||
    hay.includes('user-cancelled') ||
    hay.includes('closed')
  ) {
    return 'The sign-in window was closed before finishing. Please try again.';
  }
  if (hay.includes('unauthorized-domain') || hay.includes('unauthorized domain')) {
    return 'This site isn’t authorised for sign-in yet. Contact the administrator.';
  }
  if (
    hay.includes('did not respond') ||
    hay.includes('timeout') ||
    hay.includes('timed out') ||
    hay.includes('network')
  ) {
    return 'Google didn’t respond in time. Check your connection and try again.';
  }
  return 'Sign-in failed. Please try again.';
}
