import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { User } from 'firebase/auth';

import { SignInComponent, mapSignInError } from './sign-in.component';
import { GoogleAuth } from '../../core/auth/google-auth';

interface Stubs {
  readonly auth: GoogleAuth;
  readonly router: Router;
  readonly signIn: ReturnType<typeof vi.fn>;
  readonly navigate: ReturnType<typeof vi.fn>;
  readonly hasPendingRedirect: ReturnType<typeof vi.fn>;
  readonly completeRedirect: ReturnType<typeof vi.fn>;
}

function makeStubs(): Stubs {
  const signIn = vi.fn(async () => ({ uid: 'u1' }) as User);
  const navigate = vi.fn(async () => true);
  const hasPendingRedirect = vi.fn(() => false);
  const completeRedirect = vi.fn(async () => null as User | null);
  const auth = {
    signInWithGoogle: signIn,
    signOut: vi.fn(),
    getAccessToken: vi.fn(),
    hasPendingRedirect,
    completeRedirectSignIn: completeRedirect,
  } as unknown as GoogleAuth;
  const router = { navigateByUrl: navigate } as unknown as Router;
  return { auth, router, signIn, navigate, hasPendingRedirect, completeRedirect };
}

function render(stubs: Stubs): {
  fixture: ComponentFixture<SignInComponent>;
  cmp: SignInComponent & { signIn(): Promise<void>; error(): string | null; busy(): boolean };
  el: HTMLElement;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: GoogleAuth, useValue: stubs.auth },
      { provide: Router, useValue: stubs.router },
    ],
  });
  const fixture = TestBed.createComponent(SignInComponent);
  fixture.detectChanges();
  return {
    fixture,
    cmp: fixture.componentInstance as never,
    el: fixture.nativeElement as HTMLElement,
  };
}

describe('SignInComponent', () => {
  let stubs: Stubs;
  beforeEach(() => {
    stubs = makeStubs();
  });

  it('renders the brand logo and a Google-standard sign-in button', () => {
    const { el } = render(stubs);
    const logo = el.querySelector<HTMLImageElement>('img.sign-in__logo');
    expect(logo?.getAttribute('src')).toContain('logo-travel-sheet.png');
    const btn = el.querySelector<HTMLButtonElement>('button.gbtn');
    expect(btn?.textContent).toContain('Sign in with Google');
    expect(btn?.querySelector('svg.gbtn__g')).not.toBeNull(); // multicolour "G"
  });

  it('calls GoogleAuth.signInWithGoogle and navigates to /invoices on success', async () => {
    const { cmp } = render(stubs);
    await cmp.signIn();
    expect(stubs.signIn).toHaveBeenCalledOnce();
    expect(stubs.navigate).toHaveBeenCalledWith('/invoices');
  });

  it('shows a friendly mapped error (not the raw message) and does not navigate on failure', async () => {
    stubs.signIn.mockRejectedValueOnce(Object.assign(new Error('Firebase: popup closed'), { code: 'auth/popup-closed-by-user' }));
    const { cmp, fixture, el } = render(stubs);
    await cmp.signIn();
    fixture.detectChanges();
    expect(cmp.error()).toContain('closed before finishing');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('closed before finishing');
    expect(stubs.navigate).not.toHaveBeenCalled();
  });

  it('shows the busy state ("Signing in…", disabled) while a sign-in is in flight', () => {
    let resolveSignIn!: (u: User) => void;
    stubs.signIn.mockImplementationOnce(
      () => new Promise<User>(resolve => { resolveSignIn = resolve; }),
    );
    const { cmp, fixture, el } = render(stubs);
    void cmp.signIn();
    fixture.detectChanges();
    const btn = el.querySelector<HTMLButtonElement>('button.gbtn');
    expect(btn?.textContent?.trim()).toBe('Signing in…');
    expect(btn?.disabled).toBe(true);
    resolveSignIn({ uid: 'u1' } as User);
  });

  it('clears the busy flag after sign-in completes (success and failure)', async () => {
    const { cmp } = render(stubs);
    await cmp.signIn();
    expect(cmp.busy()).toBe(false);

    stubs.signIn.mockRejectedValueOnce(new Error('x'));
    await cmp.signIn();
    expect(cmp.busy()).toBe(false);
  });

  it('navigates only after a user is returned (mobile redirect returns null, no navigation)', async () => {
    stubs.signIn.mockResolvedValueOnce(null);
    const { cmp } = render(stubs);
    await cmp.signIn();
    expect(stubs.signIn).toHaveBeenCalledOnce();
    expect(stubs.navigate).not.toHaveBeenCalled();
  });

  it('completes a pending sign-in redirect on init and navigates to /invoices', async () => {
    stubs.hasPendingRedirect.mockReturnValue(true);
    stubs.completeRedirect.mockResolvedValueOnce({ uid: 'u1' } as User);
    render(stubs);
    await Promise.resolve();
    await Promise.resolve();
    expect(stubs.completeRedirect).toHaveBeenCalledOnce();
    expect(stubs.navigate).toHaveBeenCalledWith('/invoices');
  });

  it('does not touch the redirect flow on a normal load (no pending redirect)', () => {
    render(stubs);
    expect(stubs.completeRedirect).not.toHaveBeenCalled();
    expect(stubs.navigate).not.toHaveBeenCalled();
  });

  it('ignores re-entrant clicks while a sign-in is already in flight', async () => {
    let resolveSignIn: (u: User) => void = () => undefined;
    stubs.signIn.mockImplementationOnce(
      () => new Promise<User>(resolve => { resolveSignIn = resolve; }),
    );
    const { cmp } = render(stubs);
    const first = cmp.signIn();
    const second = cmp.signIn();
    resolveSignIn({ uid: 'u1' } as User);
    await Promise.all([first, second]);
    expect(stubs.signIn).toHaveBeenCalledOnce();
  });
});

describe('mapSignInError', () => {
  it('maps popup-blocked', () => {
    expect(mapSignInError({ code: 'auth/popup-blocked' })).toContain('blocked the sign-in window');
  });

  it('maps popup-closed / cancelled', () => {
    expect(mapSignInError({ code: 'auth/popup-closed-by-user' })).toContain('closed before finishing');
    expect(mapSignInError({ code: 'auth/cancelled-popup-request' })).toContain('closed before finishing');
  });

  it('maps unauthorized-domain', () => {
    expect(mapSignInError({ code: 'auth/unauthorized-domain' })).toContain('isn’t authorised');
  });

  it('maps a GIS timeout', () => {
    expect(
      mapSignInError(new Error('Google Identity Services did not respond within 20000 ms')),
    ).toContain('didn’t respond in time');
  });

  it('falls back to a generic message for an unknown failure', () => {
    expect(mapSignInError(new Error('some unexpected boom'))).toBe('Sign-in failed. Please try again.');
  });
});
