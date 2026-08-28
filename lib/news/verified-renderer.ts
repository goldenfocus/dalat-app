import type { NewsTag } from '@/lib/types/blog';
import type { VerifiedClaimLedger, VerifiedFactGroup } from './types';

export interface RenderedVerifiedNews {
  title: string;
  storyContent: string;
  technicalContent: string;
  metaDescription: string;
  newsTags: NewsTag[];
  newsTopic: string;
}

const TITLE_KEY_PRIORITY = [
  'event.title',
  'announcement.title',
  'project.title',
  'venue.name',
  'organization.name',
  'organizer.name',
  'place.name',
  'person.name',
  'event.start_date',
  'announcement.date',
];

const PREFIX_TAGS: Partial<Record<string, NewsTag>> = {
  culture: 'culture',
  economy: 'government',
  environment: 'weather',
  event: 'events',
  government: 'government',
  health: 'community',
  policy: 'government',
  tourism: 'tourism',
  weather: 'weather',
};

function sentenceCase(value: string): string {
  return value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

export function factLabel(normalizedKey: string): string {
  if (normalizedKey.startsWith('quote.')) return 'Quote';
  return sentenceCase(normalizedKey.replaceAll('.', ' ').replaceAll('_', ' '));
}

function displayValue(fact: VerifiedFactGroup): string {
  return fact.normalizedKey.startsWith('quote.') ? `“${fact.value}”` : fact.value;
}

function chooseTitleFact(facts: VerifiedFactGroup[]): VerifiedFactGroup {
  for (const key of TITLE_KEY_PRIORITY) {
    const match = facts.find((fact) => fact.normalizedKey === key);
    if (match) return match;
  }
  return facts.find((fact) => !fact.normalizedKey.startsWith('quote.')) ?? facts[0];
}

/**
 * Fail-closed article rendering. The model never authors published prose:
 * every displayed factual value comes byte-for-byte from the accepted ledger,
 * while the only added words are fixed labels derived from the closed key
 * taxonomy. Richer prose can be added later through reviewed key templates.
 */
export function renderVerifiedNews(ledger: VerifiedClaimLedger): RenderedVerifiedNews {
  if (ledger.factGroups.length === 0) {
    throw new Error('Cannot render news from an empty verified fact ledger');
  }

  const titleFact = chooseTitleFact(ledger.factGroups);
  const title = `${factLabel(titleFact.normalizedKey)}: ${displayValue(titleFact)}`;
  const factLines = ledger.factGroups.map(
    (fact) => `- **${factLabel(fact.normalizedKey)}:** ${displayValue(fact)}`
  );
  const storyContent = `**Verified details**\n\n${factLines.join('\n')}`;
  const metaDescription = title.slice(0, 160);
  const tags = new Set<NewsTag>();
  for (const fact of ledger.factGroups) {
    const prefix = fact.normalizedKey.split('.')[0];
    const tag = PREFIX_TAGS[prefix];
    if (tag) tags.add(tag);
  }

  return {
    title,
    storyContent,
    technicalContent: '',
    metaDescription,
    newsTags: [...tags].slice(0, 3),
    newsTopic: title,
  };
}
