import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { User } from 'firebase/auth';

import { SignInComponent } from './sign-in.component';
import { GoogleAuth } from '../../core/auth/google-auth';

interface Stubs {
  readonly auth: GoogleAuth;
  readonly router: Router;
  readonly signIn: ReturnType<typeof vi.fn>;
  readonly navigate: ReturnType<typeof vi.fn>;
}

function makeStubs(): Stubs {
  const signIn = vi.fn(async () => ({ uid: 'u1' }) as User);
  const navigate = vi.fn(async () => true);
  const auth = { signInWithGoogle: signIn, signOut: vi.fn(), getAccessToken: vi.fn() } as unknown as GoogleAuth;
  const router = { navigateByUrl: navigate } as unknown as Router;
  return { auth, router, signIn, navigate };
}

function makeComponent(stubs: Stubs): SignInComponent {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: GoogleAuth, useValue: stubs.auth },
      { provide: Router, useValue: stubs.router },
    ],
  });
  return TestBed.createComponent(SignInComponent).componentInstance;
}

describe('SignInComponent', () => {
  let stubs: Stubs;
  beforeEach(() => {
    stubs = makeStubs();
  });

  it('calls GoogleAuth.signInWithGoogle and navigates to /invoices on success', async () => {
    const cmp = makeComponent(stubs);
    await (cmp as unknown as { signIn(): Promise<void> }).signIn();
    expect(stubs.signIn).toHaveBeenCalledOnce();
    expect(stubs.navigate).toHaveBeenCalledWith('/invoices');
  });

  it('surfaces the error message and does not navigate when sign-in fails', async () => {
    stubs.signIn.mockRejectedValueOnce(new Error('popup closed'));
    const cmp = makeComponent(stubs);
    await (cmp as unknown as { signIn(): Promise<void> }).signIn();
    const error = (cmp as unknown as { error(): string | null }).error();
    expect(error).toBe('popup closed');
    expect(stubs.navigate).not.toHaveBeenCalled();
  });

  it('clears the busy flag after sign-in completes (success and failure)', async () => {
    const cmp = makeComponent(stubs);
    const busy = (cmp as unknown as { busy(): boolean }).busy;
    await (cmp as unknown as { signIn(): Promise<void> }).signIn();
    expect(busy()).toBe(false);

    stubs.signIn.mockRejectedValueOnce(new Error('x'));
    await (cmp as unknown as { signIn(): Promise<void> }).signIn();
    expect(busy()).toBe(false);
  });

  it('ignores re-entrant clicks while a sign-in is already in flight', async () => {
    let resolveSignIn: (u: User) => void = () => undefined;
    stubs.signIn.mockImplementationOnce(
      () => new Promise<User>(resolve => { resolveSignIn = resolve; }),
    );
    const cmp = makeComponent(stubs);
    const first = (cmp as unknown as { signIn(): Promise<void> }).signIn();
    const second = (cmp as unknown as { signIn(): Promise<void> }).signIn();
    resolveSignIn({ uid: 'u1' } as User);
    await Promise.all([first, second]);
    expect(stubs.signIn).toHaveBeenCalledOnce();
  });
});
