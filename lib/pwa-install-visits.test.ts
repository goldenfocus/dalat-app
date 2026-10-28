import { describe, expect, it } from 'vitest';
import { INSTALL_VISITS_KEY, INSTALL_VISIT_GAP_MS, recordInstallVisit } from './pwa-install-visits';

function storage() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
}
describe('install reminders wait for returning visitors', () => {
  it('counts distinct visits, not reloads or client navigation', () => {
    const store = storage();
    expect(recordInstallVisit(store, 0)).toBe(1);
    expect(recordInstallVisit(store, 1)).toBe(1);
    expect(recordInstallVisit(store, INSTALL_VISIT_GAP_MS)).toBe(1);
    expect(recordInstallVisit(store, 2 * INSTALL_VISIT_GAP_MS)).toBe(2);
    expect(recordInstallVisit(store, 3 * INSTALL_VISIT_GAP_MS)).toBe(3);
  });
  it('treats invalid, negative, or future visit records as a first visit', () => {
    for (const value of ['broken', '{"count":-1,"lastSeen":0}', '{"count":5,"lastSeen":9999}']) {
      const store = storage(); store.setItem(INSTALL_VISITS_KEY, value);
      expect(recordInstallVisit(store, 100)).toBe(1);
    }
  });
  it('stays quiet when browser storage is blocked', () => {
    expect(recordInstallVisit({ getItem: () => { throw new Error('denied'); }, setItem: () => {} })).toBe(0);
  });
});
