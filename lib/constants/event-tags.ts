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

// Icon names from lucide-react for each tag
export type TagIconName =
  | 'Music' | 'Flower2' | 'Brain' | 'Dumbbell' | 'Footprints' | 'Palette'
  | 'Camera' | 'ChefHat' | 'Wrench' | 'GraduationCap' | 'Compass' | 'Mountain'
  | 'Trophy' | 'Users' | 'Handshake' | 'PartyPopper' | 'Sparkles' | 'UtensilsCrossed'
  | 'Coffee' | 'Store' | 'Wine' | 'Tent' | 'Mic2' | 'Frame' | 'Theater' | 'Film'
  | 'Heart' | 'Droplets' | 'Baby' | 'Sun' | 'Home' | 'Gift' | 'HeartHandshake';

// Tag display configuration with colors and icons
export const TAG_CONFIG: Record<EventTag, { label: string; color: string; icon: TagIconName }> = {
  // Activities
  music: { label: 'Music', icon: 'Music', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  yoga: { label: 'Yoga', icon: 'Flower2', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  meditation: { label: 'Meditation', icon: 'Brain', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
  fitness: { label: 'Fitness', icon: 'Dumbbell', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  dance: { label: 'Dance', icon: 'Footprints', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' },
  art: { label: 'Art', icon: 'Palette', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200' },
  photography: { label: 'Photography', icon: 'Camera', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
  cooking: { label: 'Cooking', icon: 'ChefHat', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  workshop: { label: 'Workshop', icon: 'Wrench', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  class: { label: 'Class', icon: 'GraduationCap', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200' },
  tour: { label: 'Tour', icon: 'Compass', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  hiking: { label: 'Hiking', icon: 'Mountain', color: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200' },
  sports: { label: 'Sports', icon: 'Trophy', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  // Social
  meetup: { label: 'Meetup', icon: 'Users', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200' },
  networking: { label: 'Networking', icon: 'Handshake', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200' },
  community: { label: 'Community', icon: 'Users', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
  party: { label: 'Party', icon: 'PartyPopper', color: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200' },
  celebration: { label: 'Celebration', icon: 'Sparkles', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  // Food & Drink
  food: { label: 'Food', icon: 'UtensilsCrossed', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  coffee: { label: 'Coffee', icon: 'Coffee', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  restaurant: { label: 'Restaurant', icon: 'Store', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  market: { label: 'Market', icon: 'Store', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  tasting: { label: 'Tasting', icon: 'Wine', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  // Culture
  festival: { label: 'Festival', icon: 'Tent', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  concert: { label: 'Concert', icon: 'Mic2', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  exhibition: { label: 'Exhibition', icon: 'Frame', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
  performance: { label: 'Performance', icon: 'Theater', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' },
  film: { label: 'Film', icon: 'Film', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
  // Wellness
  wellness: { label: 'Wellness', icon: 'Heart', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  retreat: { label: 'Retreat', icon: 'Tent', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
  spa: { label: 'Spa', icon: 'Droplets', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200' },
  healing: { label: 'Healing', icon: 'Heart', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200' },
  // Other
  kids: { label: 'Kids', icon: 'Baby', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  family: { label: 'Family', icon: 'Users', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  outdoor: { label: 'Outdoor', icon: 'Sun', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  indoor: { label: 'Indoor', icon: 'Home', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  free: { label: 'Free', icon: 'Gift', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  charity: { label: 'Charity', icon: 'HeartHandshake', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200' },
};

// Helper to validate tags
export function isValidTag(tag: string): tag is EventTag {
  return EVENT_TAGS.includes(tag as EventTag);
}

// Filter to only valid tags
export function filterValidTags(tags: string[]): EventTag[] {
  return tags.filter(isValidTag);
}
