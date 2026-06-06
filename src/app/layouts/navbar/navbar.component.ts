import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { GoogleAuth } from '../../core/auth/google-auth';
import { AuthState } from '../../core/auth/auth-state';
import { ToastOutletComponent } from '../../shared/ui/toast/toast-outlet.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastOutletComponent],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  private readonly auth = inject(GoogleAuth);
  private readonly authState = inject(AuthState);
  private readonly router = inject(Router);

  protected readonly user = this.authState.user;
  protected readonly displayName = computed(() => this.user()?.displayName ?? null);
  protected readonly email = computed(() => this.user()?.email ?? null);
  protected readonly photoURL = computed(() => this.user()?.photoURL ?? null);
  /** Initials fallback for the avatar when there's no photoURL. */
  protected readonly initials = computed(() =>
    computeInitials(this.displayName(), this.email()),
  );

  protected readonly busy = signal(false);
  /** Mobile navigation drawer. */
  protected readonly menuOpen = signal(false);
  /** Desktop account dropdown. */
  protected readonly accountOpen = signal(false);

  toggleMenu(): void {
    this.menuOpen.update(open => !open);
    this.accountOpen.set(false);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  toggleAccount(): void {
    this.accountOpen.update(open => !open);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.accountOpen.set(false);
    this.menuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.accountOpen() && !target?.closest('.nav__account')) {
      this.accountOpen.set(false);
    }
    if (this.menuOpen() && !target?.closest('.nav')) {
      this.menuOpen.set(false);
    }
  }

  async signOut(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.menuOpen.set(false);
    this.accountOpen.set(false);
    try {
      await this.auth.signOut();
      await this.router.navigateByUrl('/sign-in');
    } finally {
      this.busy.set(false);
    }
  }
}

/** Two-letter initials from a display name ("Maria Ivanova" → "MI"), or the
 *  first two characters of the email, or "?" when neither is available. */
function computeInitials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
