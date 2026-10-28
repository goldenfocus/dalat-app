type Attempt = { attemptedAt: number; retryAt: number; small: boolean };

/** Only identifiers and scheduling metadata; never source text or credentials. */
export class RetrySchedule {
  private attempts = new Map<string, Attempt>();

  constructor(saved: unknown = {}) {
    if (!saved || typeof saved !== "object" || Array.isArray(saved))
      throw new Error("Invalid translation retry state");
    for (const [key, value] of Object.entries(saved)) {
      const row = value as Attempt;
      if (
        !row ||
        !Number.isFinite(row.attemptedAt) ||
        !Number.isFinite(row.retryAt) ||
        typeof row.small !== "boolean"
      )
        throw new Error("Invalid translation retry entry");
      this.attempts.set(key, { ...row });
    }
  }

  snapshot() {
    return Object.fromEntries(this.attempts);
  }
  priority(key: string) {
    return this.attempts.get(key)?.attemptedAt || 0;
  }
  deferred(key: string, now: number) {
    return (this.attempts.get(key)?.retryAt || 0) > now;
  }
  small(key: string) {
    return this.attempts.get(key)?.small || false;
  }

  start(keys: string[], now: number) {
    for (const key of keys)
      this.attempts.set(key, {
        attemptedAt: now,
        retryAt: 0,
        small: this.small(key),
      });
  }

  failed(keys: string[], now: number, timedOut: boolean) {
    for (const key of keys)
      this.attempts.set(key, {
        attemptedAt: this.priority(key) || now,
        retryAt: now + 15 * 60_000,
        small: timedOut || this.small(key),
      });
  }

  complete(keys: string[]) {
    for (const key of keys) this.attempts.delete(key);
  }
}
