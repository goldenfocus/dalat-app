import { describe, expect, it } from 'vitest';
import { isInternalAccountEmail } from './index';

describe('isInternalAccountEmail', () => {
  it('blocks every dalat.app account address', () => {
    expect(isInternalAccountEmail('ghost_demo@dalat.app')).toBe(true);
    expect(isInternalAccountEmail('ghost.demo@dalat.app')).toBe(true);
    expect(isInternalAccountEmail('organizer@placeholder.dalat.app')).toBe(true);
    expect(isInternalAccountEmail('events@dalat.app')).toBe(true);
  });

  it('allows customer addresses outside the internal domain', () => {
    expect(isInternalAccountEmail('person@example.com')).toBe(false);
  });
});
