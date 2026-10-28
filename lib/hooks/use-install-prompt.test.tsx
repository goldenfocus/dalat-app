import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInstallPrompt } from './use-install-prompt';
import { INSTALL_VISITS_KEY } from '../pwa-install-visits';

beforeEach(() => {
  vi.useFakeTimers();
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('automatic install reminders', () => {
  it('does not interrupt the first or second visit, including remounts', () => {
    for (const count of [0, 1]) {
      if (count) localStorage.setItem(INSTALL_VISITS_KEY, JSON.stringify({ count, lastSeen: Date.now() - 31 * 60 * 1000 }));
      const view = renderHook(() => useInstallPrompt());
      act(() => vi.advanceTimersByTime(15000));
      expect(view.result.current.installState).toBe('unsupported');
      view.unmount();
    }
  });
  it('waits before suggesting installation on the third separate visit', () => {
    localStorage.setItem(INSTALL_VISITS_KEY, JSON.stringify({ count: 2, lastSeen: Date.now() - 31 * 60 * 1000 }));
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.installState).toBe('unsupported');
    act(() => vi.advanceTimersByTime(12000));
    expect(result.current.installState).toBe('prompt');
    act(() => result.current.dismissPrompt());
    expect(result.current.installState).toBe('dismissed');
  });
});
