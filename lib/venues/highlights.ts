export interface VenueHighlight {
  id: string;
  media_url: string;
  thumbnail_url: string | null;
  event_id: string;
  event_slug: string;
  event_title: string;
  created_at: string;
  featured_priority: number;
  view_count: number;
  quality_score?: number;
}

/** Curated order wins; automatic picks spread strong photos across gatherings. */
export function selectVenueHighlights(photos: VenueHighlight[], selectedIds: string[], limit = 6) {
  const byId = new Map(photos.map(photo => [photo.id, photo]));
  const selected = [...new Set(selectedIds)].flatMap(id => byId.get(id) ? [byId.get(id)!] : []).slice(0, limit);
  const remaining = photos.filter(photo => !selected.some(pick => pick.id === photo.id)).sort((a, b) =>
    b.featured_priority - a.featured_priority || (b.quality_score ?? 0.5) - (a.quality_score ?? 0.5) || b.view_count - a.view_count || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  const usedEvents = new Set(selected.map(photo => photo.event_id));
  for (const photo of remaining) {
    if (selected.length >= limit) break;
    if (!usedEvents.has(photo.event_id)) {
      selected.push(photo);
      usedEvents.add(photo.event_id);
    }
  }
  for (const photo of remaining) {
    if (selected.length >= limit) break;
    if (!selected.some(pick => pick.id === photo.id)) selected.push(photo);
  }
  return selected;
}
