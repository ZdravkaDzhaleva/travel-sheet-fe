import type { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'sign-in',
    loadComponent: () =>
      import('./features/sign-in/sign-in.component').then(m => m.SignInComponent),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'company-info',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/company-info/company-info.component').then(m => m.CompanyInfoComponent),
  },
  {
    path: 'invoices',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/invoices/invoices.component').then(m => m.InvoicesComponent),
  },
  {
    path: 'generate',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/generate/generate.component').then(m => m.GenerateComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: '**', redirectTo: 'home' },
];
