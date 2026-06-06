import { describe, it, expect, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { ErrorAlertComponent } from './error-alert.component';

function render(
  inputs: Partial<{
    title: string;
    message: string;
    retryable: boolean;
    retrying: boolean;
    retryLabel: string;
  }> = {},
): ComponentFixture<ErrorAlertComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ErrorAlertComponent] });
  const fixture = TestBed.createComponent(ErrorAlertComponent);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return fixture;
}

describe('ErrorAlertComponent', () => {
  it('renders an alert region with the title', () => {
    const fixture = render({ title: 'Couldn’t load your invoices' });
    const el = fixture.nativeElement as HTMLElement;
    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(el.querySelector('.error-alert__title')?.textContent).toContain('Couldn’t load your invoices');
  });

  it('shows the technical message when provided, hides it when empty', () => {
    const withMsg = render({ message: 'GIS did not respond within 20000 ms' });
    expect(
      (withMsg.nativeElement as HTMLElement).querySelector('.error-alert__text')?.textContent,
    ).toContain('GIS did not respond within 20000 ms');

    const noMsg = render({ message: '' });
    expect((noMsg.nativeElement as HTMLElement).querySelector('.error-alert__text')).toBeNull();
  });

  it('hides the Retry button unless retryable', () => {
    const off = render({ retryable: false });
    expect((off.nativeElement as HTMLElement).querySelector('button')).toBeNull();

    const on = render({ retryable: true });
    const btn = (on.nativeElement as HTMLElement).querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn?.tagName).toBe('BUTTON');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits retry on click', () => {
    const fixture = render({ retryable: true });
    const spy = vi.fn();
    fixture.componentInstance.retry.subscribe(spy);
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('disables Retry and shows a busy label while retrying', () => {
    const fixture = render({ retryable: true, retrying: true });
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('Retrying');
  });
});
