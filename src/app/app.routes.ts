import type { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'sign-in',
    loadComponent: () =>
      import('./features/sign-in/sign-in.component').then(m => m.SignInComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/navbar/navbar.component').then(m => m.NavbarComponent),
    children: [
      {
        path: 'invoices',
        loadComponent: () =>
          import('./features/invoices/invoices.component').then(m => m.InvoicesComponent),
      },
      {
        path: 'generate',
        loadComponent: () =>
          import('./features/generate/generate.component').then(m => m.GenerateComponent),
      },
      {
        path: 'company-info',
        loadComponent: () =>
          import('./features/company-info/company-info.component').then(
            m => m.CompanyInfoComponent,
          ),
      },
      { path: '', pathMatch: 'full', redirectTo: 'invoices' },
    ],
  },
  { path: '**', redirectTo: 'invoices' },
];
