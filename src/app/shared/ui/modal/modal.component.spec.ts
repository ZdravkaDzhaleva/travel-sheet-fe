import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component } from '@angular/core';
import { ModalComponent } from './modal.component';

@Component({
  standalone: true,
  imports: [ModalComponent],
  template: `
    <app-modal [open]="open" [title]="title" (closed)="onClose()">
      <div modal-body><input id="body-input" /><button id="body-btn">OK</button></div>
      <div modal-footer><button id="footer-btn">Cancel</button></div>
    </app-modal>
  `,
})
class HostComponent {
  open = false;
  title = 'Test Modal';
  readonly onClose = vi.fn();
}

/** Set initial state BEFORE the first detectChanges to avoid NG0100. */
function render(open = false): ComponentFixture<HostComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.open = open;
  fixture.detectChanges();
  return fixture;
}

describe('ModalComponent', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders dialog with aria-modal and aria-labelledby pointing to the title when open', () => {
    const fixture = render(true);
    const el = fixture.nativeElement as HTMLElement;
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby')!;
    expect(el.querySelector(`#${titleId}`)?.textContent?.trim()).toBe('Test Modal');
  });

  it('does not render dialog when closed', () => {
    const fixture = render(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')).toBeNull();
  });

  it('projects body and footer content', () => {
    const fixture = render(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#body-input')).toBeTruthy();
    expect(el.querySelector('#body-btn')).toBeTruthy();
    expect(el.querySelector('#footer-btn')).toBeTruthy();
  });

  it('emits closed when ✕ button is clicked', () => {
    const fixture = render(true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.modal-close')!.click();
    expect(fixture.componentInstance.onClose).toHaveBeenCalledOnce();
  });

  it('emits closed when backdrop (scrim) is clicked directly', () => {
    const fixture = render(true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.modal-scrim')!.click();
    expect(fixture.componentInstance.onClose).toHaveBeenCalledOnce();
  });

  it('does not emit closed when dialog content is clicked', () => {
    const fixture = render(true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.modal-dialog')!.click();
    expect(fixture.componentInstance.onClose).not.toHaveBeenCalled();
  });

  it('emits closed when Escape is pressed while open', () => {
    const fixture = render(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(fixture.componentInstance.onClose).toHaveBeenCalledOnce();
  });

  it('does not emit closed when Escape is pressed while not open', () => {
    const fixture = render(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(fixture.componentInstance.onClose).not.toHaveBeenCalled();
  });
});
