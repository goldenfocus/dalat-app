import { describe, expect, it } from 'vitest';
import {
  detectAcceptLanguage,
  normalizeLocale,
  resolvePreferredLocale,
} from './locale-detection';

describe('normalizeLocale', () => {
  it('normalizes supported regional browser locales', () => {
    expect(normalizeLocale('es-ES')).toBe('es');
    expect(normalizeLocale('ZH-Hant')).toBe('zh');
  });

  it('rejects unsupported locales', () => {
    expect(normalizeLocale('pt-BR')).toBeNull();
  });
});

describe('detectAcceptLanguage', () => {
  it('uses quality weights and falls through unsupported languages', () => {
    expect(detectAcceptLanguage('pt-BR, es-ES;q=0.9, en;q=0.8')).toBe('es');
    expect(detectAcceptLanguage('en-US;q=0.7, es-ES;q=0.9')).toBe('es');
  });

  it('ignores languages explicitly disabled with q=0', () => {
    expect(detectAcceptLanguage('es;q=0, fr;q=0.8')).toBe('fr');
  });
});

describe('resolvePreferredLocale', () => {
  it('prefers a saved cookie over member and browser preferences', () => {
    expect(resolvePreferredLocale({
      cookieLocale: 'vi',
      profileLocale: 'fr',
      acceptLanguage: 'es-ES',
    })).toBe('vi');
  });

  it('uses a connected member preference when there is no saved cookie', () => {
    expect(resolvePreferredLocale({
      profileLocale: 'fr',
      acceptLanguage: 'es-ES',
    })).toBe('fr');
  });

  it('detects Spanish from the browser when no preference is saved', () => {
    expect(resolvePreferredLocale({ acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8' })).toBe('es');
  });

  it('falls back to English when no supported preference exists', () => {
    expect(resolvePreferredLocale({ acceptLanguage: 'pt-BR' })).toBe('en');
  });
});
