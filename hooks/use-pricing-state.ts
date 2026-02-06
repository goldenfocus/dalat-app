"use client";

import { useState, useCallback } from "react";
import type { TicketTier, PriceType } from "@/components/events/ticket-tier-input";

interface UsePricingStateOptions {
  initialPriceType?: PriceType | null;
  initialTicketTiers?: TicketTier[];
  initialCapacity?: number | null;
}

interface UsePricingStateReturn {
  priceType: PriceType | null;
  setPriceType: (type: PriceType | null) => void;
  ticketTiers: TicketTier[];
  setTicketTiers: (tiers: TicketTier[]) => void;
  hasCapacityLimit: boolean;
  setHasCapacityLimit: (has: boolean) => void;
  initialCapacity: number | null;
}

/**
 * Hook to manage pricing and ticket tier state.
 * Groups related state for capacity, price type, and ticket tiers.
 */
export function usePricingState({
  initialPriceType = null,
  initialTicketTiers = [],
  initialCapacity = null,
}: UsePricingStateOptions = {}): UsePricingStateReturn {
  const [priceType, setPriceType] = useState<PriceType | null>(initialPriceType);
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>(initialTicketTiers);
  const [hasCapacityLimit, setHasCapacityLimit] = useState(!!initialCapacity);

  return {
    priceType,
    setPriceType,
    ticketTiers,
    setTicketTiers,
    hasCapacityLimit,
    setHasCapacityLimit,
    initialCapacity,
  };
}
