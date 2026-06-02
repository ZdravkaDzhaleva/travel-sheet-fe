import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import type { User } from 'firebase/auth';

import { authGuard } from './auth.guard';
import { AuthState } from './auth-state';

const EMPTY_ROUTE = {} as ActivatedRouteSnapshot;
const EMPTY_STATE = {} as RouterStateSnapshot;

function configure(user: User | null): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthState,
        useValue: {
          waitForFirstAuthState: vi.fn(async () => user),
        },
      },
    ],
  });
}

function invoke(): Promise<unknown> {
  return TestBed.runInInjectionContext(() =>
    authGuard(EMPTY_ROUTE, EMPTY_STATE),
  ) as Promise<unknown>;
}

describe('authGuard', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('allows activation when a Firebase user is present', async () => {
    configure({ uid: 'u1' } as User);
    await expect(invoke()).resolves.toBe(true);
  });

  it('redirects to /sign-in when no Firebase user is present', async () => {
    configure(null);
    const result = await invoke();
    const router = TestBed.inject(Router);
    expect(result).toEqual(router.createUrlTree(['/sign-in']));
  });
});
