import { describe, it, expect } from 'vitest';
import { isValidAudienceKey, subtractExclusions } from './resolve';

describe('isValidAudienceKey', () => {
  it('accepts all and real tags', () => {
    expect(isValidAudienceKey('all')).toBe(true);
    expect(isValidAudienceKey('games')).toBe(true);
    expect(isValidAudienceKey('pickleball')).toBe(true);
  });
  it('rejects unknown keys', () => {
    expect(isValidAudienceKey('everyone')).toBe(false);
    expect(isValidAudienceKey('')).toBe(false);
    expect(isValidAudienceKey('drop table')).toBe(false);
  });
});

describe('subtractExclusions', () => {
  it('removes excluded ids and dedupes', () => {
    const members = ['a', 'b', 'b', 'c', 'd'];
    const excluded = new Set(['b', 'd']);
    expect(subtractExclusions(members, excluded)).toEqual(['a', 'c']);
  });
  it('returns empty when all excluded', () => {
    expect(subtractExclusions(['a'], new Set(['a']))).toEqual([]);
  });
});
