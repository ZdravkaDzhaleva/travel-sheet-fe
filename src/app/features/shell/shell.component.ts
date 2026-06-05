import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { GoogleAuth } from '../../core/auth/google-auth';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly auth = inject(GoogleAuth);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly menuOpen = signal(false);

  toggleMenu(): void {
    this.menuOpen.update(open => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  async signOut(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.menuOpen.set(false);
    try {
      await this.auth.signOut();
      await this.router.navigateByUrl('/sign-in');
    } finally {
      this.busy.set(false);
    }
  }
}
