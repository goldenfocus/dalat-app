'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { EventFilters } from '@/lib/types';
import { filtersToSearchParams, searchParamsToFilters } from '@/lib/events/filter-url-state';

const DEFAULT_FILTERS: EventFilters = {
  lifecycle: 'upcoming',
  categories: [],
  priceFilter: 'all',
  searchQuery: '',
  viewMode: 'list',
};

export function useEventFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize filters from URL
  const [filters, setFilters] = useState<EventFilters>(() => ({
    ...DEFAULT_FILTERS,
    ...searchParamsToFilters(searchParams),
  }));

  // Sync URL when filters change
  const updateURL = useCallback((newFilters: EventFilters) => {
    const params = filtersToSearchParams(newFilters);
    const search = params.toString();
    router.push(`${pathname}${search ? `?${search}` : ''}`, { scroll: false });
  }, [pathname, router]);

  const setFilter = useCallback(<K extends keyof EventFilters>(
    key: K,
    value: EventFilters[K]
  ) => {
    setFilters(prev => {
      const updated = { ...prev, [key]: value };
      updateURL(updated);
      return updated;
    });
  }, [updateURL]);

  const updateFilters = useCallback((partial: Partial<EventFilters>) => {
    setFilters(prev => {
      const updated = { ...prev, ...partial };
      updateURL(updated);
      return updated;
    });
  }, [updateURL]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    updateURL(DEFAULT_FILTERS);
  }, [updateURL]);

  const toggleCategory = useCallback((categoryId: string) => {
    setFilters(prev => {
      const categories = prev.categories.includes(categoryId)
        ? prev.categories.filter(c => c !== categoryId)
        : [...prev.categories, categoryId];
      const updated = { ...prev, categories };
      updateURL(updated);
      return updated;
    });
  }, [updateURL]);

  // Count active filters (excluding defaults)
  const activeFilterCount =
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.priceFilter !== 'all' ? 1 : 0) +
    (filters.searchQuery ? 1 : 0) +
    (filters.dateRange ? 1 : 0) +
    (filters.radiusKm ? 1 : 0);

  return {
    filters,
    setFilter,
    updateFilters,
    resetFilters,
    toggleCategory,
    activeFilterCount,
    hasActiveFilters: activeFilterCount > 0,
  };
}
