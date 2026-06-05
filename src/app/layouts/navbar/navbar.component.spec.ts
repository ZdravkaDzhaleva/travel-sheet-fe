import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { GoogleAuth } from '../../core/auth/google-auth';
import { NavbarComponent } from './navbar.component';

function makeAuthStub(signOutImpl: () => Promise<void> = () => Promise.resolve()) {
  return { signOut: signOutImpl } as unknown as GoogleAuth;
}

function render(authStub = makeAuthStub()) {
  TestBed.configureTestingModule({
    imports: [NavbarComponent],
    providers: [
      provideRouter([
        { path: 'sign-in', component: NavbarComponent },
        { path: 'invoices', component: NavbarComponent },
      ]),
      { provide: GoogleAuth, useValue: authStub },
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
    expect(links.some(a => a.textContent?.trim() === 'Invoices')).toBe(true);
  });

  it('renders a nav link to Generate', () => {
    const { el } = render();
    const links = Array.from(el.querySelectorAll('a.nav__link'));
    expect(links.some(a => a.textContent?.trim() === 'Generate')).toBe(true);
  });

  it('renders a nav link to Company info', () => {
    const { el } = render();
    const links = Array.from(el.querySelectorAll('a.nav__link'));
    expect(links.some(a => a.textContent?.trim() === 'Company info')).toBe(true);
  });

  it('Invoices is the first nav link', () => {
    const { el } = render();
    const links = Array.from(el.querySelectorAll('a.nav__link'));
    expect(links[0]?.textContent?.trim()).toBe('Invoices');
  });

  it('renders a router-outlet for child content', () => {
    const { el } = render();
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });

  it('sign-out button calls GoogleAuth.signOut', async () => {
    let called = false;
    const stub = makeAuthStub(() => { called = true; return Promise.resolve(); });
    const { el, fixture } = render(stub);
    const btn = el.querySelector<HTMLButtonElement>('button.nav__sign-out');
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
    const btn = el.querySelector<HTMLButtonElement>('button.nav__sign-out');
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
});
