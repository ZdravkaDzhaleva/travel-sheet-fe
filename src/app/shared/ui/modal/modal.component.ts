import {
  Component,
  DOCUMENT,
  ElementRef,
  HostListener,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject,
  input,
  output
} from '@angular/core';

let _idSeq = 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss',
})
export class ModalComponent implements OnChanges, OnDestroy {
  readonly open = input(false);
  readonly title = input('');
  readonly closed = output<void>();

  @ViewChild('dialogEl') private dialogElRef?: ElementRef<HTMLElement>;

  protected readonly titleId = `modal-title-${++_idSeq}`;
  
  private readonly doc = inject(DOCUMENT);
  private triggerEl: HTMLElement | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (!('open' in changes)) return;
    if (this.open()) {
      this.triggerEl = this.doc.activeElement as HTMLElement | null;
      this.doc.body.style.overflow = 'hidden';
      // Defer focus so the dialog is rendered before we query it.
      setTimeout(() => {
        const el = this.dialogElRef?.nativeElement;
        if (!el) return;
        const first = el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
        first.focus();
      }, 0);
    } else {
      this.doc.body.style.overflow = '';
      this.triggerEl?.focus();
      this.triggerEl = null;
    }
  }

  ngOnDestroy(): void {
    if (this.open()) this.doc.body.style.overflow = '';
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.open()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'Tab') this.trapFocus(event);
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  close(): void {
    this.closed.emit();
  }

  private trapFocus(event: KeyboardEvent): void {
    const el = this.dialogElRef?.nativeElement;
    if (!el) return;
    const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && this.doc.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.doc.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
