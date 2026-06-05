import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { AuthState } from './core/auth/auth-state';

const stubAuthState: Pick<AuthState, 'waitForFirstAuthState'> = {
  waitForFirstAuthState: () => Promise.resolve(null),
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AuthState, useValue: stubAuthState },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the router outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('shows the loading overlay before auth resolves', () => {
    let resolve!: (u: null) => void;
    TestBed.overrideProvider(AuthState, {
      useValue: {
        waitForFirstAuthState: () => new Promise<null>(r => { resolve = r; }),
      },
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.app-loading')).not.toBeNull();
    resolve(null);
  });
});
