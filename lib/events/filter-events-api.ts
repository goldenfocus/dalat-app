import { createClient } from '@/lib/supabase/client';
import type { EventFilters, EventWithFilterData } from '@/lib/types';

/**
 * Fetch filtered events using the filter_events RPC
 *
 * This function calls the comprehensive Supabase RPC that supports:
 * - Lifecycle filtering (upcoming/happening/past)
 * - Category filtering (music, food, yoga, etc.)
 * - Price filtering (all/free/paid)
 * - Full-text search across title, description, location
 * - Date range filtering
 * - Geospatial distance filtering with PostGIS
 *
 * Returns events with additional computed fields:
 * - distance_km (when user location provided)
 * - category_ids (array of category IDs)
 * - price_type, price_amount, etc.
 */
export async function fetchFilteredEvents(
  filters: EventFilters,
  limit: number = 500
): Promise<EventWithFilterData[]> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase.rpc('filter_events', {
      p_lifecycle: filters.lifecycle,
      p_categories: filters.categories.length > 0 ? filters.categories : null,
      p_price_filter: filters.priceFilter !== 'all' ? filters.priceFilter : null,
      p_search_query: filters.searchQuery || null,
      p_start_date: filters.dateRange?.start.toISOString() || null,
      p_end_date: filters.dateRange?.end.toISOString() || null,
      p_user_lat: filters.userLocation?.lat || null,
      p_user_lng: filters.userLocation?.lng || null,
      p_radius_km: filters.radiusKm || null,
      p_limit: limit,
    });

    if (error) {
      console.error('Error fetching filtered events:', error);
      throw error;
    }

    return (data || []) as EventWithFilterData[];
  } catch (err) {
    console.error('Failed to fetch filtered events:', err);
    throw err;
  }
}

/**
 * Fetch event categories from the database
 * Used to populate the filter panel with available categories
 */
export async function fetchEventCategories() {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from('event_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching event categories:', error);
      throw error;
    }

    return data || [];
  } catch (err) {
    console.error('Failed to fetch event categories:', err);
    throw err;
  }
}

/**
 * Fallback to client-side filtering when RPC is not available
 * (e.g., when migrations haven't been applied yet)
 *
 * This provides basic filtering functionality using the existing Event type
 */
export function clientSideFilter(
  events: any[],
  filters: Partial<EventFilters>
): any[] {
  let result = [...events];

  // Filter by search query
  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    result = result.filter(event =>
      event.title.toLowerCase().includes(query) ||
      (event.location_name && event.location_name.toLowerCase().includes(query)) ||
      (event.description && event.description.toLowerCase().includes(query))
    );
  }

  // Filter by date range
  if (filters.dateRange) {
    const start = filters.dateRange.start.getTime();
    const end = filters.dateRange.end.getTime();

    result = result.filter(event => {
      const eventTime = new Date(event.starts_at).getTime();
      return eventTime >= start && eventTime <= end;
    });
  }

  // Filter by distance (simple Haversine formula)
  if (filters.userLocation && filters.radiusKm) {
    const { lat: userLat, lng: userLng } = filters.userLocation;
    const radiusKm = filters.radiusKm;

    result = result.filter(event => {
      if (!event.latitude || !event.longitude) return false;

      const R = 6371; // Earth's radius in km
      const dLat = ((event.latitude - userLat) * Math.PI) / 180;
      const dLng = ((event.longitude - userLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((userLat * Math.PI) / 180) *
          Math.cos((event.latitude * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      return distance <= radiusKm;
    });
  }

  // Note: Category and price filtering require the new schema fields
  // These will only work after migrations are applied

  return result;
}

/**
 * Utility: Check if filter_events RPC is available
 * Returns true if the RPC exists and can be called
 */
export async function isFilterRPCAvailable(): Promise<boolean> {
  const supabase = createClient();

  try {
    // Try calling the RPC with minimal parameters
    const { error } = await supabase.rpc('filter_events', {
      p_lifecycle: 'upcoming',
      p_categories: null,
      p_price_filter: null,
      p_search_query: null,
      p_start_date: null,
      p_end_date: null,
      p_user_lat: null,
      p_user_lng: null,
      p_radius_km: null,
      p_limit: 1,
    });

    // If no error or the error is not "function does not exist", RPC is available
    return !error || !error.message.includes('function');
  } catch (err) {
    return false;
  }
}
