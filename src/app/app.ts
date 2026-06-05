import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthState } from './core/auth/auth-state';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly authState = inject(AuthState);
  protected readonly authReady = signal(false);

  constructor() {
    void this.authState.waitForFirstAuthState().then(() => {
      this.authReady.set(true);
    });
  }
}
