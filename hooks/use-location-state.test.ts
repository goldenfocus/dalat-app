import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocationState } from "@/hooks/use-location-state";

describe("useLocationState", () => {
  it("initializes with default null values", () => {
    const { result } = renderHook(() => useLocationState());

    expect(result.current.venueId).toBeNull();
    expect(result.current.venueName).toBeNull();
    expect(result.current.locationLat).toBeNull();
    expect(result.current.locationLng).toBeNull();
  });

  it("initializes with provided values", () => {
    const { result } = renderHook(() =>
      useLocationState({
        initialVenueId: "venue-123",
        initialVenueName: "Test Venue",
        initialLatitude: 11.9465,
        initialLongitude: 108.4419,
      })
    );

    expect(result.current.venueId).toBe("venue-123");
    expect(result.current.venueName).toBe("Test Venue");
    expect(result.current.locationLat).toBe(11.9465);
    expect(result.current.locationLng).toBe(108.4419);
  });

  describe("handleLocationSelect", () => {
    it("sets coordinates from Google Place selection", () => {
      const { result } = renderHook(() => useLocationState());

      act(() => {
        result.current.handleLocationSelect({
          type: "place",
          name: "Coffee Shop",
          address: "123 Main St",
          googleMapsUrl: "https://maps.google.com/...",
          latitude: 11.95,
          longitude: 108.45,
        });
      });

      expect(result.current.locationLat).toBe(11.95);
      expect(result.current.locationLng).toBe(108.45);
      // Should clear venue since it's a place, not a venue
      expect(result.current.venueId).toBeNull();
      expect(result.current.venueName).toBeNull();
    });

    it("sets venue data from venue selection", () => {
      const { result } = renderHook(() => useLocationState());

      act(() => {
        result.current.handleLocationSelect({
          type: "venue",
          venueId: "venue-456",
          name: "Da Lat Night Market",
          address: "Nguyen Thi Minh Khai",
          googleMapsUrl: "https://maps.google.com/...",
          latitude: 11.9404,
          longitude: 108.4379,
        });
      });

      expect(result.current.venueId).toBe("venue-456");
      expect(result.current.venueName).toBe("Da Lat Night Market");
      expect(result.current.locationLat).toBe(11.9404);
      expect(result.current.locationLng).toBe(108.4379);
    });

    it("clears all values when null is passed", () => {
      const { result } = renderHook(() =>
        useLocationState({
          initialVenueId: "venue-123",
          initialVenueName: "Test",
          initialLatitude: 11.94,
          initialLongitude: 108.44,
        })
      );

      act(() => {
        result.current.handleLocationSelect(null);
      });

      expect(result.current.venueId).toBeNull();
      expect(result.current.venueName).toBeNull();
      expect(result.current.locationLat).toBeNull();
      expect(result.current.locationLng).toBeNull();
    });
  });

  describe("handleVenueLink", () => {
    it("links a venue and updates coordinates", () => {
      const { result } = renderHook(() =>
        useLocationState({
          initialLatitude: 11.94,
          initialLongitude: 108.44,
        })
      );

      act(() => {
        result.current.handleVenueLink({
          id: "venue-789",
          name: "The Workshop",
          latitude: 11.9412,
          longitude: 108.4423,
        });
      });

      expect(result.current.venueId).toBe("venue-789");
      expect(result.current.venueName).toBe("The Workshop");
      // Coordinates should update to match venue
      expect(result.current.locationLat).toBe(11.9412);
      expect(result.current.locationLng).toBe(108.4423);
    });

    it("unlinks venue when null is passed", () => {
      const { result } = renderHook(() =>
        useLocationState({
          initialVenueId: "venue-123",
          initialVenueName: "Test Venue",
        })
      );

      act(() => {
        result.current.handleVenueLink(null);
      });

      expect(result.current.venueId).toBeNull();
      expect(result.current.venueName).toBeNull();
    });
  });

  describe("clearVenue", () => {
    it("clears only venue, keeping coordinates", () => {
      const { result } = renderHook(() =>
        useLocationState({
          initialVenueId: "venue-123",
          initialVenueName: "Test Venue",
          initialLatitude: 11.94,
          initialLongitude: 108.44,
        })
      );

      act(() => {
        result.current.clearVenue();
      });

      expect(result.current.venueId).toBeNull();
      expect(result.current.venueName).toBeNull();
      // Coordinates should be preserved
      expect(result.current.locationLat).toBe(11.94);
      expect(result.current.locationLng).toBe(108.44);
    });
  });
});
