import { inject } from '@angular/core';
import { Router, type CanActivateFn, type UrlTree } from '@angular/router';

import { AuthState } from './auth-state';

export const authGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const authState = inject(AuthState);
  const user = await authState.waitForFirstAuthState();
  return user !== null ? true : router.createUrlTree(['/sign-in']);
};
