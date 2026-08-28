import { getSourceById } from './sources';
import type { SourceTier, SourceTierMetadata } from './types';

/**
 * Editorial source-quality policy. A tier describes what a source can prove,
 * not how large or popular the publisher is.
 */
export const SOURCE_TIER_METADATA: Record<SourceTier, SourceTierMetadata> = {
  A: {
    tier: 'A',
    label: 'Primary or official',
    description: 'First-party records, public authorities, or direct primary evidence.',
    trustScore: 1,
    requiresCorroboration: false,
  },
  B: {
    tier: 'B',
    label: 'Established newsroom',
    description: 'Professional reporting with editorial accountability, but still secondary evidence.',
    trustScore: 0.9,
    requiresCorroboration: true,
  },
  C: {
    tier: 'C',
    label: 'Local specialist',
    description: 'Identifiable local or specialist publisher with a limited verification record.',
    trustScore: 0.65,
    requiresCorroboration: true,
  },
  D: {
    tier: 'D',
    label: 'Community report',
    description: 'Attributed community material that needs independent confirmation.',
    trustScore: 0.35,
    requiresCorroboration: true,
  },
  E: {
    tier: 'E',
    label: 'Unverified',
    description: 'Unknown, anonymous, promotional, or otherwise unverified material.',
    trustScore: 0.1,
    requiresCorroboration: true,
  },
};

export function getSourceTier(sourceId: string): SourceTier {
  return getSourceById(sourceId)?.tier ?? 'E';
}

export function getSourceTrustScore(tier: SourceTier): number {
  return SOURCE_TIER_METADATA[tier].trustScore;
}
