/**
 * Internal linking engine for news articles
 * Scans content for mentions of events, venues, and locations
 * and adds hyperlinks to relevant dalat.app pages
 */

import { createClient } from '@supabase/supabase-js';

interface InternalLink {
  text: string;
  url: string;
  type: 'event' | 'venue' | 'location';
}

/**
 * Build a dictionary of linkable entities from the database
 */
async function buildLinkDictionary(): Promise<Map<string, InternalLink>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn('[internal-linker] Missing Supabase credentials, skipping link dictionary');
    return new Map();
  }

  const supabase = createClient(url, key);
  const dictionary = new Map<string, InternalLink>();

  // Fetch published events (last 90 days + upcoming)
  try {
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('slug, title')
      .eq('status', 'published')
      .gte('starts_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .limit(200);

    if (eventsError) {
      console.error('[internal-linker] Events query error:', eventsError);
    } else if (events) {
      for (const event of events) {
        if (event.title && event.slug) {
          dictionary.set(event.title.toLowerCase(), {
            text: event.title,
            url: `/events/${event.slug}`,
            type: 'event',
          });
        }
      }
    }
  } catch (error) {
    console.error('[internal-linker] Failed to fetch events:', error);
  }

  // Fetch venues
  try {
    const { data: venues, error: venuesError } = await supabase
      .from('venues')
      .select('slug, name')
      .limit(200);

    if (venuesError) {
      console.error('[internal-linker] Venues query error:', venuesError);
    } else if (venues) {
      for (const venue of venues) {
        if (venue.name && venue.slug) {
          dictionary.set(venue.name.toLowerCase(), {
            text: venue.name,
            url: `/venues/${venue.slug}`,
            type: 'venue',
          });
        }
      }
    }
  } catch (error) {
    console.error('[internal-linker] Failed to fetch venues:', error);
  }

  // Add known Da Lat locations
  const locations: Array<[string, string]> = [
    ['H\u1ed3 Xu\u00e2n H\u01b0\u01a1ng', '/map'],
    ['Langbiang', '/map'],
    ['Ch\u1ee3 \u0110\u00e0 L\u1ea1t', '/map'],
    ['\u0110\u01b0\u1eddng Nguy\u1ec5n V\u0103n Tr\u1ed7i', '/map'],
    ['Qu\u1ea3ng tr\u01b0\u1eddng L\u00e2m Vi\u00ean', '/map'],
  ];

  for (const [name, linkUrl] of locations) {
    dictionary.set(name.toLowerCase(), {
      text: name,
      url: linkUrl,
      type: 'location',
    });
  }

  return dictionary;
}

/**
 * Remove Vietnamese diacritics for fuzzy matching
 */
function removeDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D');
}

/**
 * Check if text at a given position is already inside a markdown link.
 * Markdown links follow the pattern [text](url) -- we need to avoid
 * linking text that is already part of [link text] or (url).
 */
function isInsideMarkdownLink(
  content: string,
  matchStart: number,
  matchEnd: number
): boolean {
  // Look for an unmatched [ before the match (would mean we are inside [text])
  let bracketDepth = 0;
  for (let i = matchStart - 1; i >= 0; i--) {
    if (content[i] === ']') bracketDepth++;
    if (content[i] === '[') {
      if (bracketDepth === 0) return true;
      bracketDepth--;
    }
    // Stop searching after a newline (links do not span lines usually)
    if (content[i] === '\n') break;
  }

  // Check if match is inside (url) part of a link: look for ]( before and ) after
  const beforeSlice = content.slice(Math.max(0, matchStart - 200), matchStart);
  const afterSlice = content.slice(matchEnd, Math.min(content.length, matchEnd + 200));
  if (/\]\([^)]*$/.test(beforeSlice) && /^[^(]*\)/.test(afterSlice)) {
    return true;
  }

  return false;
}

/**
 * Safely replace the first occurrence of a pattern in markdown content,
 * avoiding text that is already inside a link.
 */
function safeMarkdownReplace(
  content: string,
  searchText: string,
  link: InternalLink
): string {
  const escapedText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedText, 'i');
  const match = regex.exec(content);

  if (!match) return content;

  const matchStart = match.index;
  const matchEnd = matchStart + match[0].length;

  // Do not link if already inside a markdown link
  if (isInsideMarkdownLink(content, matchStart, matchEnd)) {
    return content;
  }

  // Replace with markdown link
  return (
    content.slice(0, matchStart) +
    `[${link.text}](${link.url})` +
    content.slice(matchEnd)
  );
}

/**
 * Apply internal links to markdown content
 * Only links the first occurrence of each entity
 */
export async function applyInternalLinks(
  content: string,
  aiSuggestedLinks: InternalLink[] = []
): Promise<string> {
  const dictionary = await buildLinkDictionary();
  const linked = new Set<string>();
  let result = content;

  // Apply AI-suggested links first (higher quality)
  for (const link of aiSuggestedLinks) {
    const key = link.text.toLowerCase();
    if (linked.has(key)) continue;

    const before = result;
    result = safeMarkdownReplace(result, link.text, link);
    if (result !== before) {
      linked.add(key);
    }
  }

  // Then apply dictionary matches
  for (const [name, link] of dictionary) {
    if (linked.has(name)) continue;

    const before = result;
    result = safeMarkdownReplace(result, link.text, link);
    if (result !== before) {
      linked.add(name);
      continue;
    }

    // Also try without diacritics
    const noDiacritics = removeDiacritics(link.text);
    if (noDiacritics !== link.text) {
      result = safeMarkdownReplace(result, noDiacritics, link);
      if (result !== before) {
        linked.add(name);
      }
    }
  }

  return result;
}
