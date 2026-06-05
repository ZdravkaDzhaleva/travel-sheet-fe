import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    service = TestBed.inject(ToastService);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('show() adds a toast to the queue', () => {
    service.show('Saved', 'success');
    expect(service.toasts()).toHaveLength(1);
    expect(service.toasts()[0].message).toBe('Saved');
    expect(service.toasts()[0].type).toBe('success');
  });

  it('show() with action stores the action', () => {
    const fn = vi.fn();
    service.show('Undo?', 'error', { label: 'Undo', fn });
    expect(service.toasts()[0].action?.label).toBe('Undo');
    expect(service.toasts()[0].action?.fn).toBe(fn);
  });

  it('dismiss() removes the toast by id', () => {
    service.show('A', 'success');
    service.show('B', 'error');
    service.dismiss(service.toasts()[0].id);
    expect(service.toasts()).toHaveLength(1);
    expect(service.toasts()[0].message).toBe('B');
  });

  it('auto-dismisses after 5 seconds', () => {
    service.show('Auto', 'success');
    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(5_000);
    expect(service.toasts()).toHaveLength(0);
  });

  it('toasts dismiss independently at their own 5s window', () => {
    service.show('First', 'success');
    vi.advanceTimersByTime(2_000);
    service.show('Second', 'success');
    vi.advanceTimersByTime(3_000); // First reaches 5s
    expect(service.toasts()).toHaveLength(1);
    expect(service.toasts()[0].message).toBe('Second');
    vi.advanceTimersByTime(2_000); // Second reaches 5s
    expect(service.toasts()).toHaveLength(0);
  });
});
