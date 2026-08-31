import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractPublishedDate,
  fetchWithDelay,
  isRegisteredSourceArticleUrl,
  normalizePublishedDate,
  scrapeKnownArticle,
  stripHtml,
} from './base-scraper';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('news source text normalization', () => {
  it('decodes decimal and hexadecimal Vietnamese entities for exact evidence matching', () => {
    expect(stripHtml('&#272;&#224; L&#7841;t &amp; L&#xE2;m &#x110;&#x1ED3;ng'))
      .toBe('Đà Lạt & Lâm Đồng');
  });

  it('leaves invalid numeric entities intact', () => {
    expect(stripHtml('Value &#99999999; remains')).toBe('Value &#99999999; remains');
  });
});

describe('news publication-date safety', () => {
  it('normalizes authoritative ISO metadata', () => {
    expect(
      extractPublishedDate(
        '<meta property="article:published_time" content="2026-04-13T19:35:00+07:00">'
      )
    ).toBe('2026-04-13T12:35:00.000Z');
    expect(normalizePublishedDate('2026-08-27T08:00:00')).toBe('2026-08-27T01:00:00.000Z');
  });

  it('normalizes a Vietnamese publisher header in Asia/Ho_Chi_Minh', () => {
    expect(
      extractPublishedDate('<div class="detail-time">13/04/2026 19:35 GMT+7</div>')
    ).toBe('2026-04-13T12:35:00.000Z');
  });

  it('never lets Date.parse swap an ambiguous Vietnamese day and month', () => {
    expect(normalizePublishedDate('04/05/2026 12:00')).toBe('2026-05-04T05:00:00.000Z');
  });

  it('does not mistake an event date in article prose for publication time', () => {
    const html = '<article>The festival happens on 30/04/2026 at 19:00 in Da Lat.</article>';
    expect(extractPublishedDate(html)).toBeNull();
    expect(
      extractPublishedDate('<div class="event-date">04/05/2026 12:00</div>')
    ).toBeNull();
  });

  it('rejects impossible or date-only values instead of inventing a time', () => {
    expect(normalizePublishedDate('31/14/2026 19:35')).toBeNull();
    expect(normalizePublishedDate('31/02/2026 19:35')).toBeNull();
    expect(normalizePublishedDate('13/04/2026')).toBeNull();
  });
});

describe('known source article safety', () => {
  it('accepts only the exact registered source origin', () => {
    expect(isRegisteredSourceArticleUrl(
      'tuoitre',
      'https://tuoitre.vn/da-lat-corrected-123.htm'
    )).toBe(true);
    expect(isRegisteredSourceArticleUrl(
      'tuoitre',
      'https://evil.tuoitre.vn/da-lat-corrected-123.htm'
    )).toBe(false);
    expect(isRegisteredSourceArticleUrl(
      'tuoitre',
      'https://tuoitre.vn.evil.example/da-lat-corrected-123.htm'
    )).toBe(false);
    expect(isRegisteredSourceArticleUrl(
      'tuoitre',
      'http://tuoitre.vn/da-lat-corrected-123.htm'
    )).toBe(false);
    expect(isRegisteredSourceArticleUrl(
      'tuoitre',
      'https://tuoitre.vn:8443/da-lat-corrected-123.htm'
    )).toBe(false);
    expect(isRegisteredSourceArticleUrl(
      'unknown-source',
      'https://tuoitre.vn/da-lat-corrected-123.htm'
    )).toBe(false);
  });

  it('does not call the fetcher for a mismatched hostname', async () => {
    const fetchHtml = vi.fn(async () => '<html></html>');
    const article = await scrapeKnownArticle(
      'tuoitre',
      'https://attacker.example/redirect?to=tuoitre.vn',
      fetchHtml
    );

    expect(article).toBeNull();
    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it('refuses a redirect from a registered URL to another origin', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 302,
      headers: new Headers({ location: 'https://attacker.example/captured' }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithDelay(
      'https://tuoitre.vn/known-story-123.htm',
      0,
      'https://tuoitre.vn'
    )).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a same-origin redirect to a search page before parsing it as news', async () => {
    const article = await scrapeKnownArticle(
      'thanhnien',
      'https://thanhnien.vn/old-story-123.htm',
      async () => ({
        finalUrl: 'https://thanhnien.vn/tim-kiem.htm?keywords=old-story',
        html: `
          <html>
            <head><link rel="canonical" href="https://thanhnien.vn/tim-kiem.htm?keywords=old-story"></head>
            <body>
              <h1 class="detail__title">Search results</h1>
              <div class="detail__content">${'Search-keyword filler '.repeat(10)}</div>
            </body>
          </html>
        `,
      })
    );

    expect(article).toBeNull();
  });

  it('refuses a soft redirect whose canonical points away from the persisted article path', async () => {
    const article = await scrapeKnownArticle(
      'tuoitre',
      'https://tuoitre.vn/old-story-123.htm',
      async () => ({
        finalUrl: 'https://tuoitre.vn/old-story-123.htm',
        html: `
          <html>
            <head><meta property="og:url" content="https://tuoitre.vn/another-story-456.htm"></head>
            <body>
              <h1 class="detail-title">Another article</h1>
              <div class="detail-content">${'Unrelated article content '.repeat(10)}</div>
            </body>
          </html>
        `,
      })
    );

    expect(article).toBeNull();
  });

  it('parses a known article and passes the locked origin to the fetcher', async () => {
    const body = [
      'Đà Lạt authorities published a corrected notice for local residents.',
      'The revised source snapshot contains enough article text to pass extraction.',
      'It remains tied to the same registered publisher URL.',
    ].join(' ');
    const fetchHtml = vi.fn(async () => `
      <html>
        <head>
          <meta property="article:published_time" content="2026-08-20T09:30:00+07:00">
          <meta property="og:image" content="https://tuoitre.vn/image.jpg">
        </head>
        <body>
          <h1 class="article-title">Corrected Đà Lạt notice</h1>
          <div class="detail-content">${body}</div>
        </body>
      </html>
    `);
    const url = 'https://tuoitre.vn/corrected-da-lat-notice-123.htm';
    const article = await scrapeKnownArticle('tuoitre', url, fetchHtml);

    expect(fetchHtml).toHaveBeenCalledWith(url, 500, 'https://tuoitre.vn');
    expect(article).toMatchObject({
      sourceId: 'tuoitre',
      sourceUrl: url,
      sourceName: 'Tuổi Trẻ',
      title: 'Corrected Đà Lạt notice',
      content: body,
      imageUrls: ['https://tuoitre.vn/image.jpg'],
      publishedAt: '2026-08-20T02:30:00.000Z',
    });
    expect(Date.parse(article?.retrievedAt ?? '')).not.toBeNaN();
  });
});
