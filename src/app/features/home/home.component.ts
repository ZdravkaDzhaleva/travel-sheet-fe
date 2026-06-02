import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { GoogleAuth } from '../../core/auth/google-auth';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  private readonly auth = inject(GoogleAuth);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);

  async signOut(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.auth.signOut();
      await this.router.navigateByUrl('/sign-in');
    } finally {
      this.busy.set(false);
    }
  }
}
