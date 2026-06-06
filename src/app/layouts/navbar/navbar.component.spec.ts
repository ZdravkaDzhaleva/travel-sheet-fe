import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import type { User } from 'firebase/auth';

import { GoogleAuth } from '../../core/auth/google-auth';
import { AuthState } from '../../core/auth/auth-state';
import { NavbarComponent } from './navbar.component';

function makeAuthStub(signOutImpl: () => Promise<void> = () => Promise.resolve()) {
  return { signOut: signOutImpl } as unknown as GoogleAuth;
}

function makeAuthState(user: Partial<User> | null = null): AuthState {
  return { user: signal(user as User | null).asReadonly() } as unknown as AuthState;
}

function render(authStub = makeAuthStub(), authState = makeAuthState()) {
  TestBed.configureTestingModule({
    imports: [NavbarComponent],
    providers: [
      provideRouter([
        { path: 'sign-in', component: NavbarComponent },
        { path: 'invoices', component: NavbarComponent },
        { path: 'generate', component: NavbarComponent },
        { path: 'company-info', component: NavbarComponent },
      ]),
      { provide: GoogleAuth, useValue: authStub },
      { provide: AuthState, useValue: authState },
    ],
  });
  const fixture = TestBed.createComponent(NavbarComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el };
}

describe('NavbarComponent', () => {
  it('renders a nav link to Invoices', () => {
    const { el } = render();
    const links = Array.from(el.querySelectorAll('a.nav__link'));
    expect(links.some(a => a.textContent?.trim() === 'INVOICES')).toBe(true);
  });

  it('renders a nav link to Generate', () => {
    const { el } = render();
    const links = Array.from(el.querySelectorAll('a.nav__link'));
    expect(links.some(a => a.textContent?.trim() === 'GENERATE')).toBe(true);
  });

  it('renders a nav link to Company info', () => {
    const { el } = render();
    const links = Array.from(el.querySelectorAll('a.nav__link'));
    expect(links.some(a => a.textContent?.trim() === 'COMPANY INFO')).toBe(true);
  });

  it('Invoices is the first nav link', () => {
    const { el } = render();
    const links = Array.from(el.querySelectorAll('a.nav__link'));
    expect(links[0]?.textContent?.trim()).toBe('INVOICES');
  });

  it('renders a router-outlet for child content', () => {
    const { el } = render();
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });

  it('marks the active route link with the indicator class', async () => {
    const { el, fixture } = render();
    await TestBed.inject(Router).navigate(['/generate']);
    fixture.detectChanges();
    const active = el.querySelector('a.nav__link--active');
    expect(active?.textContent?.trim()).toBe('GENERATE');
  });

  it('sign-out button calls GoogleAuth.signOut', async () => {
    let called = false;
    const stub = makeAuthStub(() => { called = true; return Promise.resolve(); });
    const { el, fixture } = render(stub);
    const btn = el.querySelector<HTMLButtonElement>('button.nav__signout');
    btn!.click();
    await fixture.whenStable();
    expect(called).toBe(true);
  });

  it('sign-out button shows "Signing out…" while busy and is disabled', async () => {
    let resolveSignOut!: () => void;
    const stub = makeAuthStub(
      () => new Promise<void>(resolve => { resolveSignOut = resolve; }),
    );
    const { el, fixture } = render(stub);
    const btn = el.querySelector<HTMLButtonElement>('button.nav__signout');
    btn!.click();
    fixture.detectChanges();
    expect(btn!.textContent?.trim()).toBe('Signing out…');
    expect(btn!.disabled).toBe(true);
    resolveSignOut();
    await fixture.whenStable();
  });

  it('hamburger button toggles aria-expanded', () => {
    const { el, fixture } = render();
    const burger = el.querySelector<HTMLButtonElement>('.nav__burger');
    expect(burger).not.toBeNull();
    expect(burger!.getAttribute('aria-expanded')).toBe('false');
    burger!.click();
    fixture.detectChanges();
    expect(burger!.getAttribute('aria-expanded')).toBe('true');
    burger!.click();
    fixture.detectChanges();
    expect(burger!.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking a nav link closes the mobile menu', () => {
    const { el, fixture } = render();
    el.querySelector<HTMLButtonElement>('.nav__burger')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLAnchorElement>('a.nav__link')!.click();
    fixture.detectChanges();
    const burger = el.querySelector<HTMLButtonElement>('.nav__burger');
    expect(burger!.getAttribute('aria-expanded')).toBe('false');
  });

  // ── Account dropdown ──────────────────────────────────────────────────────

  it('opens the account dropdown on click and closes on Escape', () => {
    const { el, fixture } = render(
      makeAuthStub(),
      makeAuthState({ displayName: 'Maria Ivanova', email: 'maria@example.com', photoURL: null }),
    );
    const acct = el.querySelector<HTMLButtonElement>('button.nav__acct')!;
    expect(el.querySelector('.nav__dropdown')).toBeNull();
    expect(acct.getAttribute('aria-expanded')).toBe('false');

    acct.click();
    fixture.detectChanges();
    expect(el.querySelector('.nav__dropdown')).not.toBeNull();
    expect(acct.getAttribute('aria-expanded')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('.nav__dropdown')).toBeNull();
  });

  it('closes the account dropdown on an outside click', () => {
    const { el, fixture } = render(
      makeAuthStub(),
      makeAuthState({ displayName: 'Maria Ivanova', email: 'maria@example.com', photoURL: null }),
    );
    el.querySelector<HTMLButtonElement>('button.nav__acct')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.nav__dropdown')).not.toBeNull();

    // A click outside the account cluster closes it.
    el.querySelector<HTMLElement>('.nav__brand')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('.nav__dropdown')).toBeNull();
  });

  // ── Surfaced identity ─────────────────────────────────────────────────────

  it('surfaces the signed-in identity (name + email)', () => {
    const { el } = render(
      makeAuthStub(),
      makeAuthState({ displayName: 'Maria Ivanova', email: 'maria@example.com', photoURL: null }),
    );
    expect(el.textContent).toContain('maria@example.com');
    expect(el.textContent).toContain('Maria Ivanova');
  });

  it('shows initials in the avatar when there is no photoURL', () => {
    const { el } = render(
      makeAuthStub(),
      makeAuthState({ displayName: 'Maria Ivanova', email: 'maria@example.com', photoURL: null }),
    );
    const avatars = Array.from(el.querySelectorAll('.nav__avatar'));
    expect(avatars.length).toBeGreaterThan(0);
    expect(avatars.some(a => a.textContent?.trim() === 'MI')).toBe(true);
    expect(el.querySelector('.nav__avatar-img')).toBeNull();
  });

  it('renders the photo in the avatar when photoURL is present', () => {
    const { el } = render(
      makeAuthStub(),
      makeAuthState({ displayName: 'X', email: 'x@example.com', photoURL: 'https://img.example/p.png' }),
    );
    const img = el.querySelector<HTMLImageElement>('.nav__avatar-img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://img.example/p.png');
  });
});
