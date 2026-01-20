import { EventFilters } from '@/lib/types';

export function filtersToSearchParams(filters: EventFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.lifecycle !== 'upcoming') params.set('lifecycle', filters.lifecycle);
  if (filters.categories.length > 0) params.set('categories', filters.categories.join(','));
  if (filters.priceFilter !== 'all') params.set('price', filters.priceFilter);
  if (filters.searchQuery) params.set('q', filters.searchQuery);
  if (filters.dateRange) {
    params.set('from', filters.dateRange.start.toISOString().split('T')[0]);
    params.set('to', filters.dateRange.end.toISOString().split('T')[0]);
  }
  if (filters.radiusKm) params.set('radius', filters.radiusKm.toString());
  if (filters.viewMode !== 'list') params.set('view', filters.viewMode);
  if (filters.calendarView && filters.viewMode === 'calendar') {
    params.set('calView', filters.calendarView);
  }

  return params;
}

export function searchParamsToFilters(searchParams: URLSearchParams): Partial<EventFilters> {
  const filters: Partial<EventFilters> = {};

  const lifecycle = searchParams.get('lifecycle');
  if (lifecycle && ['upcoming', 'happening', 'past'].includes(lifecycle)) {
    filters.lifecycle = lifecycle as EventFilters['lifecycle'];
  }

  const categories = searchParams.get('categories');
  if (categories) filters.categories = categories.split(',').filter(Boolean);

  const price = searchParams.get('price');
  if (price && ['all', 'free', 'paid'].includes(price)) {
    filters.priceFilter = price as EventFilters['priceFilter'];
  }

  const q = searchParams.get('q');
  if (q) filters.searchQuery = q;

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from && to) {
    filters.dateRange = {
      start: new Date(from),
      end: new Date(to)
    };
  }

  const radius = searchParams.get('radius');
  if (radius) filters.radiusKm = parseFloat(radius);

  const view = searchParams.get('view');
  if (view && ['list', 'grid', 'map', 'calendar'].includes(view)) {
    filters.viewMode = view as EventFilters['viewMode'];
  }

  const calView = searchParams.get('calView');
  if (calView && ['month', 'week', 'day', 'agenda'].includes(calView)) {
    filters.calendarView = calView as EventFilters['calendarView'];
  }

  return filters;
}

export function getShareableFilterUrl(filters: EventFilters, baseUrl: string): string {
  const params = filtersToSearchParams(filters);
  return `${baseUrl}?${params.toString()}`;
}
