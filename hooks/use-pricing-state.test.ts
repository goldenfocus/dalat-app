import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePricingState } from "@/hooks/use-pricing-state";

describe("usePricingState", () => {
  it("initializes with default values", () => {
    const { result } = renderHook(() => usePricingState());

    expect(result.current.priceType).toBeNull();
    expect(result.current.ticketTiers).toEqual([]);
    expect(result.current.hasCapacityLimit).toBe(false);
    expect(result.current.initialCapacity).toBeNull();
  });

  it("initializes with provided values", () => {
    const tiers = [
      { name: "General", price: 50000, currency: "VND" as const },
      { name: "VIP", price: 150000, currency: "VND" as const },
    ];

    const { result } = renderHook(() =>
      usePricingState({
        initialPriceType: "paid",
        initialTicketTiers: tiers,
        initialCapacity: 100,
      })
    );

    expect(result.current.priceType).toBe("paid");
    expect(result.current.ticketTiers).toEqual(tiers);
    expect(result.current.hasCapacityLimit).toBe(true);
    expect(result.current.initialCapacity).toBe(100);
  });

  it("sets hasCapacityLimit to true when capacity is provided", () => {
    const { result } = renderHook(() =>
      usePricingState({
        initialCapacity: 50,
      })
    );

    expect(result.current.hasCapacityLimit).toBe(true);
  });

  it("sets hasCapacityLimit to false when capacity is null", () => {
    const { result } = renderHook(() =>
      usePricingState({
        initialCapacity: null,
      })
    );

    expect(result.current.hasCapacityLimit).toBe(false);
  });

  describe("setPriceType", () => {
    it("updates price type", () => {
      const { result } = renderHook(() => usePricingState());

      act(() => {
        result.current.setPriceType("free");
      });

      expect(result.current.priceType).toBe("free");
    });

    it("can set price type to null", () => {
      const { result } = renderHook(() =>
        usePricingState({ initialPriceType: "paid" })
      );

      act(() => {
        result.current.setPriceType(null);
      });

      expect(result.current.priceType).toBeNull();
    });
  });

  describe("setTicketTiers", () => {
    it("updates ticket tiers", () => {
      const { result } = renderHook(() => usePricingState());

      const newTiers = [
        { name: "Early Bird", price: 30000, currency: "VND" as const },
      ];

      act(() => {
        result.current.setTicketTiers(newTiers);
      });

      expect(result.current.ticketTiers).toEqual(newTiers);
    });

    it("can clear ticket tiers", () => {
      const initialTiers = [
        { name: "General", price: 50000, currency: "VND" as const },
      ];
      const { result } = renderHook(() =>
        usePricingState({ initialTicketTiers: initialTiers })
      );

      act(() => {
        result.current.setTicketTiers([]);
      });

      expect(result.current.ticketTiers).toEqual([]);
    });
  });

  describe("setHasCapacityLimit", () => {
    it("enables capacity limit", () => {
      const { result } = renderHook(() => usePricingState());

      act(() => {
        result.current.setHasCapacityLimit(true);
      });

      expect(result.current.hasCapacityLimit).toBe(true);
    });

    it("disables capacity limit", () => {
      const { result } = renderHook(() =>
        usePricingState({ initialCapacity: 100 })
      );

      act(() => {
        result.current.setHasCapacityLimit(false);
      });

      expect(result.current.hasCapacityLimit).toBe(false);
    });
  });
});
