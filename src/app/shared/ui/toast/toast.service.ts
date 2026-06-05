import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error';

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly type: ToastType;
  readonly action?: { readonly label: string; readonly fn: () => void };
}

let _idSeq = 0;
const DISMISS_MS = 5_000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<readonly Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(message: string, type: ToastType, action?: Toast['action']): void {
    const id = ++_idSeq;
    this._toasts.update(q => [...q, { id, message, type, action }]);
    setTimeout(() => this.dismiss(id), DISMISS_MS);
  }

  dismiss(id: number): void {
    this._toasts.update(q => q.filter(t => t.id !== id));
  }
}
