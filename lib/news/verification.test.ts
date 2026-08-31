import { describe, expect, it } from 'vitest';
import { buildRewritePrompt } from './news-prompt';
import { SOURCE_TIER_METADATA } from './source-quality';
import { NEWS_SOURCES } from './sources';
import type { ClaimCandidate, ClaimExtractionSource } from './types';
import {
  buildSourceProvenance,
  buildVerifiedClaimLedger,
  countEvidenceWords,
  createClaimExtractionSources,
  evidenceAppearsInSource,
  validateGeneratedContent,
} from './verification';

const NOW = new Date('2026-08-27T12:00:00.000Z');

function source(
  sourceIndex: number,
  text: string,
  overrides: Partial<ClaimExtractionSource> = {}
): ClaimExtractionSource {
  return {
    sourceIndex,
    sourceId: `source-${sourceIndex}`,
    sourceUrl: `https://news.example/source-${sourceIndex}`,
    publisher: `Publisher ${sourceIndex}`,
    tier: 'B',
    title: `Source ${sourceIndex} title`,
    text,
    publishedAt: '2026-08-27T08:00:00.000Z',
    retrievedAt: '2026-08-27T09:00:00.000Z',
    ...overrides,
  };
}

function claim(
  sourceIndex: number,
  key: string,
  value: string,
  evidenceFragment: string,
  confidence = 0.95
): ClaimCandidate {
  return { sourceIndex, key, value, evidenceFragment, confidence };
}

describe('verified news claim ledger', () => {
  it('accepts only short evidence that is deterministically present and records provenance', () => {
    const sources = [
      source(1, 'The notice says the venue will admit 500 registered guests on 12/09/2026.'),
    ];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'venue.capacity', '500', 'The notice says the venue will admit 500 registered guests'),
      claim(1, 'venue.overflow_capacity', '700', 'will admit 700 registered guests'),
    ], sources, NOW);

    expect(evidenceAppearsInSource(
      'WILL admit   500 registered guests',
      sources[0].text
    )).toBe(true);
    expect(countEvidenceWords('The notice says the venue will admit 500 registered guests')).toBe(10);
    expect(ledger.acceptedClaims).toHaveLength(1);
    expect(ledger.acceptedClaims[0]).toMatchObject({
      sourceIndex: 1,
      sourceUrl: sources[0].sourceUrl,
      sourceTier: 'B',
      normalizedKey: 'venue.capacity',
      normalizedValue: '500',
      retrievedAt: sources[0].retrievedAt,
      publishedAt: sources[0].publishedAt,
      evidenceFragment: 'The notice says the venue will admit 500 registered guests',
    });
    expect(ledger.rejectedClaims[0].reason).toBe('evidence-not-found');

    const provenance = buildSourceProvenance(sources, ledger);
    expect(provenance[0]).toMatchObject({
      tier: 'B',
      retrieved_at: sources[0].retrievedAt,
      claims: [{
        source_index: 1,
        normalized_key: 'venue.capacity',
        normalized_value: '500',
        evidence_fragment: 'The notice says the venue will admit 500 registered guests',
      }],
    });
  });

  it('matches the same ordered evidence words across source parentheticals and punctuation', () => {
    expect(evidenceAppearsInSource(
      'lực lượng Công an tỉnh Lâm Đồng phong tỏa hiện trường',
      'Lực lượng Công an tỉnh Lâm Đồng (tỉnh Lâm Đồng) phong tỏa hiện trường.'
    )).toBe(true);
    expect(evidenceAppearsInSource(
      'lực lượng phong tỏa Công an',
      'Lực lượng Công an tỉnh Lâm Đồng phong tỏa hiện trường.'
    )).toBe(false);
  });

  it('normalizes a Vietnamese day-month using the trusted source publication year', () => {
    const evidence = 'Sự kiện du lịch diễn ra ngày 30-8.';
    const sources = [source(1, evidence, {
      publishedAt: '2026-08-30T03:00:00.000Z',
    })];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'event.start_date', '2026-08-30', 'Sự kiện du lịch diễn ra ngày 30-8'),
      claim(1, 'event.end_date', '2026-09-30', 'Sự kiện du lịch diễn ra ngày 30-8'),
    ], sources, NOW);

    expect(ledger.acceptedClaims.map(item => item.normalizedValue)).toEqual(['2026-08-30']);
    expect(ledger.rejectedClaims[0].reason).toBe('value-not-supported');
  });

  it('rejects evidence fragments longer than 20 words', () => {
    const longEvidence = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one';
    const sources = [source(1, longEvidence)];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'word.count', 'twenty-one', longEvidence),
    ], sources, NOW);

    expect(countEvidenceWords(longEvidence)).toBe(21);
    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.rejectedClaims[0].reason).toBe('evidence-too-long');
  });

  it('rejects every supported value when sources conflict on the same key', () => {
    const sources = [
      source(1, "The venue's official capacity is 500 guests."),
      source(2, "The venue's official capacity is 700 guests."),
    ];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'venue.capacity', '500', "venue's official capacity is 500 guests"),
      claim(2, 'venue.capacity', '700', "venue's official capacity is 700 guests"),
    ], sources, NOW);

    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.factGroups).toHaveLength(0);
    expect(ledger.conflictingKeyCount).toBe(1);
    expect(ledger.rejectedClaims.map((item) => item.reason)).toEqual([
      'conflicting-value',
      'conflicting-value',
    ]);
    expect(ledger.metrics.agreement).toBe(0);
  });

  it('canonicalizes semantic key aliases before conflict detection', () => {
    const sources = [
      source(1, 'The property name is Thang Nam Homestay. The event is on 12/09/2026.'),
      source(2, 'The venue name is Sunny Sky Homestay. The event is on 13/09/2026.'),
    ];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'property.name', 'Thang Nam Homestay', 'property name is Thang Nam Homestay'),
      claim(2, 'venue.name', 'Sunny Sky Homestay', 'venue name is Sunny Sky Homestay'),
      claim(1, 'event.date', '2026-09-12', 'event is on 12/09/2026'),
      claim(2, 'event.start_date', '2026-09-13', 'event is on 13/09/2026'),
    ], sources, NOW);

    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.conflictingKeyCount).toBe(2);
    expect(ledger.rejectedClaims.every((item) => item.reason === 'conflicting-value')).toBe(true);
  });

  it('rejects supported values under unknown claim keys', () => {
    const sources = [source(1, 'A mystery value is 500.')];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'model.escape_hatch', '500', 'value is 500'),
    ], sources, NOW);

    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.rejectedClaims[0].reason).toBe('unsupported-key');
  });

  it('keeps publisher identity out of the model-authored fact ledger', () => {
    const sources = [source(1, 'Tuổi Trẻ published the report.')];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'publisher.name', 'Tuổi Trẻ', 'Tuổi Trẻ published the report'),
    ], sources, NOW);

    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.rejectedClaims[0].reason).toBe('unsupported-key');
  });

  it('cannot attach a wrong number or year to an otherwise exact source excerpt', () => {
    const exactCapacityExcerpt = 'The venue will admit 500 registered guests.';
    const exactDateExcerpt = 'The event date is 12/09/2026.';
    const sources = [source(1, `${exactCapacityExcerpt} ${exactDateExcerpt}`)];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'venue.capacity', '700', exactCapacityExcerpt),
      claim(1, 'event.start_date', '2027-09-12', exactDateExcerpt),
    ], sources, NOW);

    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.rejectedClaims).toHaveLength(2);
    expect(ledger.rejectedClaims.every((item) => item.reason === 'value-not-supported')).toBe(true);
  });

  it('does not turn a mentioned visitor into a venue owner', () => {
    const evidence = 'John Doe visited the venue.';
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'venue.owner', 'John Doe', 'John Doe visited the venue'),
    ], [source(1, evidence)], NOW);

    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.rejectedClaims[0].reason).toBe('key-not-supported');
  });

  it('accepts an explicitly stated Vietnamese organizer relationship', () => {
    const evidence = 'Sự kiện do Hiệp hội Green Valley tổ chức.';
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'event.organizer', 'Hiệp hội Green Valley', 'Sự kiện do Hiệp hội Green Valley tổ chức'),
    ], [source(1, evidence)], NOW);

    expect(ledger.acceptedClaims).toHaveLength(1);
    expect(ledger.acceptedClaims[0].normalizedKey).toBe('event.organizer');
  });

  it('accepts short exact Vietnamese tourism and revenue facts without unit conversion', () => {
    const evidence = 'Lâm Đồng đón hơn 16,46 triệu lượt khách. Đặt phòng du lịch tăng khoảng 40%. Doanh thu du lịch đạt 45.600 tỉ đồng.';
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'tourism.attendance', '16,46 triệu lượt khách', 'Lâm Đồng đón hơn 16,46 triệu lượt khách'),
      claim(1, 'tourism.percentage', '40%', 'Đặt phòng du lịch tăng khoảng 40%'),
      claim(1, 'economy.amount', '45.600 tỉ đồng', 'Doanh thu du lịch đạt 45.600 tỉ đồng'),
    ], [source(1, evidence)], NOW);

    expect(ledger.acceptedClaims.map((item) => ({
      key: item.normalizedKey,
      value: item.value,
    }))).toEqual([
      { key: 'tourism.attendance', value: '16,46 triệu lượt khách' },
      { key: 'tourism.percentage', value: '40%' },
      { key: 'economy.amount', value: '45.600 tỉ đồng' },
    ]);
  });

  it('rejects negated relationship statements instead of inverting them', () => {
    const cases = [
      ['venue.owner', 'John Doe', 'The venue is not owned by John Doe'],
      ['event.organizer', 'John Doe', 'The event was not organized by John Doe'],
      ['venue.operator', 'John Doe', 'The venue is not operated by John Doe'],
      ['organization.founder', 'John Doe', 'The organization was not founded by John Doe'],
      ['venue.owner', 'John Doe', 'John Doe không phải là chủ sở hữu'],
      ['venue.owner', 'John Doe', 'Officials denied the venue was owned by John Doe'],
      ['venue.owner', 'John Doe', 'Whether the venue is owned by John Doe remains unclear'],
      ['venue.owner', 'John Doe', 'The venue may be owned by John Doe'],
      ['venue.owner', 'John Doe', 'An alleged owner is John Doe'],
      ['venue.owner', 'John Doe', 'John Doe được cho là chủ sở hữu'],
    ] as const;

    for (const [key, value, evidence] of cases) {
      const ledger = buildVerifiedClaimLedger([
        claim(1, key, value, evidence),
      ], [source(1, `${evidence}.`)], NOW);
      expect(ledger.acceptedClaims, evidence).toHaveLength(0);
      expect(ledger.rejectedClaims[0].reason, evidence).toBe('key-not-supported');
    }
  });

  it('cannot hide denial or uncertainty outside the selected evidence substring', () => {
    const cases = [
      ['event.status', 'cancelled', 'Officials denied the event was cancelled.', 'the event was cancelled'],
      ['incident.cause', 'rain', 'Officials denied that rain caused the incident.', 'rain caused the incident'],
      ['venue.name', 'Sunny Sky Homestay', 'Officials denied Sunny Sky Homestay was the venue.', 'Sunny Sky Homestay was the venue'],
      ['venue.owner', 'John Doe', 'Officials denied Mr. John Doe owned the venue.', 'John Doe owned the venue'],
      ['incident.cause', 'rain', 'It is unclear whether rain caused the incident.', 'rain caused the incident'],
      ['incident.cause', 'rain', 'It is unlikely that rain caused the incident.', 'rain caused the incident'],
      ['incident.cause', 'rain', 'It is doubtful rain caused the incident.', 'rain caused the incident'],
      ['incident.cause', 'rain', 'It is improbable that rain caused the incident.', 'rain caused the incident'],
      ['incident.cause', 'rain', 'The possibility that rain caused the incident remains under review.', 'rain caused the incident'],
      ['incident.cause', 'rain', 'The theory is rain caused the incident.', 'rain caused the incident'],
      ['incident.cause', 'rain', 'A rumor said rain caused the incident.', 'rain caused the incident'],
      ['event.status', 'cancelled', 'The event was cancelled. Officials denied the report.', 'The event was cancelled'],
      ['quote.organizer', 'We are ready', 'The organizer denied saying “We are ready”.', '“We are ready”'],
    ] as const;

    for (const [key, value, sourceText, evidence] of cases) {
      const ledger = buildVerifiedClaimLedger([
        claim(1, key, value, evidence),
      ], [source(1, sourceText)], NOW);
      expect(ledger.acceptedClaims, sourceText).toHaveLength(0);
      expect(ledger.rejectedClaims[0].reason, sourceText).toBe('key-not-supported');
    }
  });

  it('does not turn plain prose into a direct quotation', () => {
    const evidence = 'John Doe visited the venue on Tuesday.';
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'quote.john_doe', 'John Doe visited the venue', 'John Doe visited the venue'),
    ], [source(1, evidence)], NOW);

    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.rejectedClaims[0].reason).toBe('key-not-supported');
  });

  it('rejects negated non-relationship fields before fixed labels can invert them', () => {
    const cases = [
      ['incident.cause', 'rain', 'Officials confirmed rain did not cause the incident'],
      ['event.status', 'cancelled', 'The event has not been cancelled'],
      ['event.venue', 'Sunny Sky Homestay', 'The event is not at Sunny Sky Homestay'],
    ] as const;

    for (const [key, value, evidence] of cases) {
      const ledger = buildVerifiedClaimLedger([
        claim(1, key, value, evidence),
      ], [source(1, `${evidence}.`)], NOW);
      expect(ledger.acceptedClaims, evidence).toHaveLength(0);
      expect(ledger.rejectedClaims[0].reason, evidence).toBe('key-not-supported');
    }
  });

  it('requires a semantic cue for every rendered field key', () => {
    const cases = [
      ['incident.cause', 'rain', 'Heavy rain began at noon'],
      [
        'incident.cause',
        'rain',
        'Rain began at noon. Officials said faulty wiring caused the fire',
      ],
      [
        'event.status',
        'cancelled',
        'The event remains open. A separate booking was cancelled',
      ],
    ] as const;

    for (const [key, value, evidence] of cases) {
      const ledger = buildVerifiedClaimLedger([
        claim(1, key, value, evidence),
      ], [source(1, `${evidence}.`)], NOW);
      expect(ledger.acceptedClaims, evidence).toHaveLength(0);
      expect(ledger.rejectedClaims[0].reason, evidence).toBe('key-not-supported');
    }
  });

  it('requires the exact value to occupy the field role in one declarative clause', () => {
    const cases = [
      ['incident.cause', 'rain', 'Rain began near the incident caused by wiring'],
      ['venue.name', 'Sunny Sky Homestay', 'The venue sold Sunny Sky Homestay products'],
      ['event.status', 'cancelled', 'The event refunded cancelled tickets after staying open'],
      ['incident.cause', 'rain', 'Did rain cause the incident?'],
      ['incident.cause', 'rain', 'Rain can cause the incident'],
      ['incident.cause', 'rain', 'Rain would cause the incident'],
      ['incident.cause', 'rain', 'If rain caused the incident'],
    ] as const;

    for (const [key, value, evidence] of cases) {
      const ledger = buildVerifiedClaimLedger([
        claim(1, key, value, evidence),
      ], [source(1, `${evidence}.`)], NOW);
      expect(ledger.acceptedClaims, evidence).toHaveLength(0);
      expect(ledger.rejectedClaims[0].reason, evidence).toBe('key-not-supported');
    }
  });

  it('never constructs evidence across the headline/body boundary', () => {
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'incident.cause', 'rain', 'Rain incident caused by wiring'),
    ], [source(1, 'incident caused by wiring.', { title: 'Rain' })], NOW);

    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.rejectedClaims[0].reason).toBe('evidence-not-found');
  });

  it('never accepts a headline-only claim that the article body corrects', () => {
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'event.status', 'cancelled', 'Event was cancelled'),
    ], [source(
      1,
      'Officials denied the cancellation and confirmed the event remains open.',
      { title: 'Event was cancelled' }
    )], NOW);

    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.rejectedClaims[0].reason).toBe('evidence-not-found');
  });

  it('compares normalized dates by ordered calendar value and never ignores currency', () => {
    const evidence = 'The event date is 12/09/2026 and the listed price is 500 VND.';
    const sources = [source(1, evidence)];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'event.start_date', '2026-12-09', 'event date is 12/09/2026'),
      claim(1, 'event.price', 'USD 500', 'listed price is 500 VND'),
    ], sources, NOW);

    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.rejectedClaims.map((item) => item.reason)).toEqual([
      'value-not-supported',
      'value-not-supported',
    ]);
  });

  it('never treats matching numbers as support for a fabricated entity phrase', () => {
    const evidence = 'Thang Nam homestay welcomed guests on 30 April 2026.';
    const sources = [source(1, evidence)];
    const ledger = buildVerifiedClaimLedger([
      claim(
        1,
        'venue.name',
        'Sunny Sky Homestay opened on 30 April 2026',
        evidence
      ),
    ], sources, NOW);

    expect(ledger.acceptedClaims).toHaveLength(0);
    expect(ledger.rejectedClaims[0].reason).toBe('value-not-supported');
  });

  it('keeps raw article prose and evidence fragments out of the generation prompt', () => {
    const rawPhrase = 'the venue notice confirms capacity is 500 registered guests';
    const sources = [
      source(1, rawPhrase, { title: 'A unique raw source headline' }),
    ];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'venue.capacity', '500', rawPhrase),
    ], sources, NOW);
    const prompt = buildRewritePrompt(ledger);

    expect(prompt).toContain('venue.capacity');
    expect(prompt).toContain('500');
    expect(prompt).not.toContain(rawPhrase);
    expect(prompt).not.toContain(sources[0].title);
    expect(prompt).not.toContain(sources[0].publisher);
    expect(prompt).not.toContain(sources[0].sourceUrl);
    expect(prompt).not.toContain(ledger.acceptedClaims[0].evidenceFragment);
  });
});

describe('deterministic generated-prose guards', () => {
  const sources = [
    source(1, [
      'The venue will admit 500 guests.',
      'The event date is 12/09/2026.',
      'The organizer said “We are ready”.',
    ].join(' ')),
  ];
  const ledger = buildVerifiedClaimLedger([
    claim(1, 'venue.capacity', '500', 'The venue will admit 500 guests'),
    claim(1, 'event.start_date', '2026-09-12', 'The event date is 12/09/2026'),
    claim(1, 'quote.organizer', 'We are ready', '“We are ready”'),
  ], sources, NOW);

  it('allows numbers, absolute dates, and exact quotes present in accepted claims', () => {
    const issues = validateGeneratedContent({
      title: 'Festival details confirmed',
      storyContent: 'The venue will admit 500 guests on 2026-09-12. The organizer said “We are ready”.',
      technicalContent: '',
      metaDescription: 'Confirmed festival information.',
    }, ledger);

    expect(issues).toEqual([]);
  });

  it('rejects unsupported quotes, relative dates, and invented numbers', () => {
    const issues = validateGeneratedContent({
      title: 'Festival details',
      storyContent: 'Tomorrow the venue will admit 700 guests. The organizer said “Bring everyone”.',
      technicalContent: '',
      metaDescription: '',
    }, ledger);

    expect(new Set(issues.map((issue) => issue.code))).toEqual(new Set([
      'unsupported-quote',
      'relative-date',
      'invented-number',
    ]));
  });

  it('rejects an invented real-world business name even when dates remain supported', () => {
    const issues = validateGeneratedContent({
      title: 'Sunny Sky Homestay confirms event details',
      storyContent: 'The event at Sunny Sky Homestay is scheduled for 2026-09-12.',
      technicalContent: '',
      metaDescription: '',
    }, ledger);

    expect(issues.map((issue) => issue.code)).toContain('unsupported-entity');
  });

  it('rejects fabricated people and organizations without relying on a business suffix', () => {
    const issues = validateGeneratedContent({
      title: 'Festival details',
      storyContent: 'Green Valley Association asked Nguyen Van Minh to lead the event.',
      technicalContent: '',
      metaDescription: '',
    }, ledger);

    expect(issues.map((issue) => issue.code)).toContain('unsupported-entity');
  });

  it('rejects unsupported ownership even when the entity is an allowed publisher', () => {
    const publisherLedger = buildVerifiedClaimLedger([
      claim(1, 'venue.capacity', '500', 'will admit 500 guests'),
    ], [source(1, 'The venue will admit 500 guests.', { publisher: 'Green Valley Association' })], NOW);
    const issues = validateGeneratedContent({
      title: 'Venue details',
      storyContent: 'Green Valley Association operates the venue, which admits 500 guests.',
      technicalContent: '',
      metaDescription: '',
    }, publisherLedger);

    expect(issues.map((issue) => issue.code)).toContain('unsupported-entity');
  });

  it('allows an organizer relationship explicitly represented in the fact ledger', () => {
    const organizerLedger = buildVerifiedClaimLedger([
      claim(1, 'event.organizer', 'Green Valley Association', 'The event organizer is Green Valley Association'),
    ], [source(1, 'The event organizer is Green Valley Association.')], NOW);
    const issues = validateGeneratedContent({
      title: 'Event organizer',
      storyContent: 'The event is organized by Green Valley Association.',
      technicalContent: '',
      metaDescription: '',
    }, organizerLedger);

    expect(issues).toEqual([]);
  });

  it('does not let an organizer fact authorize ownership or operation claims', () => {
    const organizerLedger = buildVerifiedClaimLedger([
      claim(1, 'event.organizer', 'Green Valley Association', 'The event organizer is Green Valley Association'),
    ], [source(1, 'The event organizer is Green Valley Association.')], NOW);

    for (const unsupported of [
      'Green Valley Association owns the venue.',
      'The venue is operated by Green Valley Association.',
    ]) {
      const issues = validateGeneratedContent({
        title: 'Event organizer',
        storyContent: unsupported,
        technicalContent: '',
        metaDescription: '',
      }, organizerLedger);
      expect(issues.map((issue) => issue.code)).toContain('unsupported-entity');
    }
  });

  it('keeps markdown headings from merging into a valid entity on the next line', () => {
    const organizerLedger = buildVerifiedClaimLedger([
      claim(1, 'event.organizer', 'Green Valley Association', 'The event organizer is Green Valley Association'),
    ], [source(1, 'The event organizer is Green Valley Association.')], NOW);
    const issues = validateGeneratedContent({
      title: 'Event organizer',
      storyContent: '## Event details\n\nThe event is organized by Green Valley Association.',
      technicalContent: '',
      metaDescription: '',
    }, organizerLedger);

    expect(issues).toEqual([]);
  });

  it('rejects publisher attribution from generated prose even when the source is real', () => {
    const issues = validateGeneratedContent({
      title: 'Festival details',
      storyContent: 'Tuổi Trẻ reported that the venue will admit 500 guests.',
      technicalContent: '',
      metaDescription: '',
    }, ledger);

    expect(issues.map((issue) => issue.code)).toContain('unsupported-publisher-attribution');
  });

  it('rejects a generated date with the right digits in the wrong order', () => {
    const issues = validateGeneratedContent({
      title: 'Festival details',
      storyContent: 'The event is scheduled for 2026-12-09.',
      technicalContent: '',
      metaDescription: '',
    }, ledger);

    expect(issues.map((issue) => issue.code)).toContain('unsupported-date');
  });

  it('keeps numeric values paired with the currency or unit that supports them', () => {
    const pairSources = [source(1, 'The price is 500 VND and the route is 2 km.')];
    const pairLedger = buildVerifiedClaimLedger([
      claim(1, 'event.price', '500 VND', 'price is 500 VND'),
      claim(1, 'transport.distance', '2 km', 'route is 2 km'),
    ], pairSources, NOW);
    const issues = validateGeneratedContent({
      title: 'Route information',
      storyContent: 'The route is 500 km.',
      technicalContent: '',
      metaDescription: '',
    }, pairLedger);

    expect(issues.map((issue) => issue.code)).toContain('unsupported-unit');
  });
});

describe('source tier policy', () => {
  it('defines A-E metadata and classifies every current newspaper as Tier B', () => {
    expect(Object.keys(SOURCE_TIER_METADATA)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(NEWS_SOURCES).not.toHaveLength(0);
    expect(NEWS_SOURCES.every((item) => item.tier === 'B')).toBe(true);
    expect(NEWS_SOURCES.every((item) => item.official === false)).toBe(true);
  });

  it('never grants a registered tier or publisher identity to a mismatched origin', () => {
    const [trusted, mismatched] = createClaimExtractionSources([
      {
        sourceId: 'tuoitre',
        sourceUrl: 'https://tuoitre.vn/verified-story.htm',
        sourceName: 'Spoofed display name',
        title: 'Trusted source',
        content: 'Đà Lạt source text.',
        imageUrls: [],
        publishedAt: null,
      },
      {
        sourceId: 'tuoitre',
        sourceUrl: 'https://attacker.example/copied-story.htm',
        sourceName: 'Different Publisher',
        title: 'Mismatched source',
        content: 'Untrusted source text.',
        imageUrls: [],
        publishedAt: null,
      },
    ], '2026-08-27T09:00:00.000Z');

    expect(trusted).toMatchObject({ tier: 'B', publisher: 'Tuổi Trẻ' });
    expect(mismatched).toMatchObject({ tier: 'E', publisher: 'Different Publisher' });
  });
});
