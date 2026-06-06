import { Component, input, output } from '@angular/core';

/**
 * Branded, readable error alert shared across feature pages (Invoices,
 * Company info, Generate) so every error state looks and behaves identically
 */
@Component({
  selector: 'app-error-alert',
  standalone: true,
  imports: [],
  templateUrl: './error-alert.component.html',
  styleUrl: './error-alert.component.scss',
})
export class ErrorAlertComponent {
  /** Human-readable headline (e.g. "Couldn't load your invoices"). */
  readonly title = input('Something went wrong');
  /** Technical detail shown as muted secondary text; hidden when empty. */
  readonly message = input('');
  /** When true, renders a Retry button that emits `retry`. */
  readonly retryable = input(false);
  /** Whether the Retry button is busy (disables it + shows a busy cursor). */
  readonly retrying = input(false);
  readonly retryLabel = input('Retry');

  readonly retry = output<void>();

  protected onRetry(): void {
    this.retry.emit();
  }
}
