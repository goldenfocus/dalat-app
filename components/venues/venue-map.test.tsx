import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VenueMap } from "./venue-map";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const props = {
  latitude: 11.9411827, longitude: 108.4605052,
  name: "Tâm Citta — Vegan & Art", address: "53/26 Hùng Vương",
  googleMapsUrl: "https://share.google/Ov6yBzW4D6kX1k3oR",
  directionsLabel: "Get directions", viewOnMapLabel: "View on map",
};
describe("venue map precision", () => {
  it("never routes to or draws a street-level approximation", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
    render(<VenueMap {...props} approximate />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Get directions" }).getAttribute("href")).toBe(props.googleMapsUrl);
    expect(screen.getByRole("link", { name: "View on map" }).getAttribute("href")).toBe(props.googleMapsUrl);
  });
  it("preserves coordinate navigation for precise venue pins", () => {
    render(<VenueMap {...props} />);
    expect(screen.getByRole("link", { name: "Get directions" }).getAttribute("href")).toBe("https://www.google.com/maps/dir/?api=1&destination=11.9411827,108.4605052");
  });
});
