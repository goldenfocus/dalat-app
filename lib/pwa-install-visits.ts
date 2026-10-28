/** A visit starts after 30 minutes away, not on every navigation or reload. */
export const INSTALL_VISITS_KEY = 'pwa-install-visits';
export const INSTALL_VISIT_GAP_MS = 30 * 60 * 1000;
export const INSTALL_MIN_VISITS = 3;

export function recordInstallVisit(storage: Pick<Storage, 'getItem' | 'setItem'>, now = Date.now()): number {
  try {
    const raw = storage.getItem(INSTALL_VISITS_KEY);
    let previous = null;
    try { previous = raw ? JSON.parse(raw) : null; } catch { /* Reset corrupt visit history. */ }
    const valid = previous && Number.isSafeInteger(previous.count) && previous.count > 0 &&
      Number.isFinite(previous.lastSeen) && previous.lastSeen <= now;
    const count = valid ? previous.count + (now - previous.lastSeen >= INSTALL_VISIT_GAP_MS ? 1 : 0) : 1;
    storage.setItem(INSTALL_VISITS_KEY, JSON.stringify({ count, lastSeen: now }));
    return count;
  } catch {
    // Storage may be unavailable in private browsers. Stay quiet in that case.
    return 0;
  }
}
