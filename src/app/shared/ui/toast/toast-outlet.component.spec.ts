import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ToastOutletComponent } from './toast-outlet.component';
import { ToastService } from './toast.service';

function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ToastOutletComponent] });
  const service = TestBed.inject(ToastService);
  const fixture = TestBed.createComponent(ToastOutletComponent);
  fixture.detectChanges();
  return { fixture, service, el: fixture.nativeElement as HTMLElement };
}

describe('ToastOutletComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('renders a success toast', () => {
    const { fixture, service, el } = render();
    service.show('Invoice saved', 'success');
    fixture.detectChanges();
    expect(el.textContent).toContain('Invoice saved');
    expect(el.querySelector('.toast--success')).toBeTruthy();
  });

  it('renders an error toast', () => {
    const { fixture, service, el } = render();
    service.show('Upload failed', 'error');
    fixture.detectChanges();
    expect(el.textContent).toContain('Upload failed');
    expect(el.querySelector('.toast--error')).toBeTruthy();
  });

  it('dismiss button removes the toast', () => {
    const { fixture, service, el } = render();
    service.show('Test', 'success');
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.toast__dismiss')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.toast')).toBeNull();
  });

  it('action button calls fn and dismisses the toast', () => {
    const { fixture, service, el } = render();
    const fn = vi.fn();
    service.show('Deleted', 'success', { label: 'Undo', fn });
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.toast__action')!.click();
    fixture.detectChanges();
    expect(fn).toHaveBeenCalledOnce();
    expect(el.querySelector('.toast')).toBeNull();
  });
});
