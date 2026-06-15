import { Component, inject } from '@angular/core';
import { ToastService, type Toast } from './toast.service';

@Component({
  selector: 'app-toast-outlet',
  imports: [],
  styleUrl: './toast-outlet.component.scss',
  template: `
    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      @for (toast of toasts(); track toast.id) {
        <div
          class="toast"
          [class.toast--success]="toast.type === 'success'"
          [class.toast--error]="toast.type === 'error'"
          role="status"
        >
          <span class="toast__message">{{ toast.message }}</span>
          @if (toast.action) {
            <button type="button" class="toast__action" (click)="runAction(toast)">
              {{ toast.action.label }}
            </button>
          }
          <button type="button" class="toast__dismiss" aria-label="Dismiss" (click)="dismiss(toast.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" aria-hidden="true" width="14" height="14">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastOutletComponent {
  private readonly service = inject(ToastService);
  protected readonly toasts = this.service.toasts;

  protected dismiss(id: number): void {
    this.service.dismiss(id);
  }

  protected runAction(toast: Toast): void {
    toast.action?.fn();
    this.service.dismiss(toast.id);
  }
}
