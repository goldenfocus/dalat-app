/**
 * Event tag taxonomy for auto-categorization.
 * AI classifies events into 2-5 tags from this list.
 */

// All valid event tags
export const EVENT_TAGS = [
  // Activities
  'music', 'yoga', 'meditation', 'fitness', 'dance', 'art', 'photography',
  'cooking', 'workshop', 'class', 'tour', 'hiking', 'sports',
  // Social
  'meetup', 'networking', 'community', 'party', 'celebration',
  // Food & Drink
  'food', 'coffee', 'restaurant', 'market', 'tasting',
  // Culture
  'festival', 'concert', 'exhibition', 'performance', 'film',
  // Wellness
  'wellness', 'retreat', 'spa', 'healing',
  // Other
  'kids', 'family', 'outdoor', 'indoor', 'free', 'charity'
] as const;

export type EventTag = typeof EVENT_TAGS[number];

// Tag display configuration with colors and icons
export const TAG_CONFIG: Record<EventTag, { label: string; color: string }> = {
  // Activities
  music: { label: 'Music', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  yoga: { label: 'Yoga', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  meditation: { label: 'Meditation', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
  fitness: { label: 'Fitness', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  dance: { label: 'Dance', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' },
  art: { label: 'Art', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200' },
  photography: { label: 'Photography', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
  cooking: { label: 'Cooking', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  workshop: { label: 'Workshop', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  class: { label: 'Class', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200' },
  tour: { label: 'Tour', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  hiking: { label: 'Hiking', color: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200' },
  sports: { label: 'Sports', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  // Social
  meetup: { label: 'Meetup', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200' },
  networking: { label: 'Networking', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200' },
  community: { label: 'Community', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
  party: { label: 'Party', color: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200' },
  celebration: { label: 'Celebration', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  // Food & Drink
  food: { label: 'Food', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  coffee: { label: 'Coffee', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  restaurant: { label: 'Restaurant', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  market: { label: 'Market', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  tasting: { label: 'Tasting', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  // Culture
  festival: { label: 'Festival', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  concert: { label: 'Concert', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  exhibition: { label: 'Exhibition', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
  performance: { label: 'Performance', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' },
  film: { label: 'Film', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
  // Wellness
  wellness: { label: 'Wellness', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  retreat: { label: 'Retreat', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
  spa: { label: 'Spa', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200' },
  healing: { label: 'Healing', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200' },
  // Other
  kids: { label: 'Kids', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  family: { label: 'Family', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  outdoor: { label: 'Outdoor', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  indoor: { label: 'Indoor', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  free: { label: 'Free', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  charity: { label: 'Charity', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200' },
};

// Helper to validate tags
export function isValidTag(tag: string): tag is EventTag {
  return EVENT_TAGS.includes(tag as EventTag);
}

// Filter to only valid tags
export function filterValidTags(tags: string[]): EventTag[] {
  return tags.filter(isValidTag);
}
