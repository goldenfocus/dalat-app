import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VenueMap } from "./venue-map";

afterEach(cleanup);
const props = {
  latitude: 11.9411827, longitude: 108.4605052,
  name: "Tâm Citta — Vegan & Art", address: "53/26 Hùng Vương",
  googleMapsUrl: "https://share.google/Ov6yBzW4D6kX1k3oR",
  directionsLabel: "Get directions", viewOnMapLabel: "View on map",
};
describe("venue map precision", () => {
  it("never routes to or draws a street-level approximation", () => {
    render(<VenueMap {...props} approximate />);
    expect(screen.queryByRole("link", { name: `View on map · ${props.name}` })).toBeNull();
    expect(screen.getByText(props.address)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Get directions" }).getAttribute("href")).toBe(props.googleMapsUrl);
    expect(screen.getByRole("link", { name: "View on map" }).getAttribute("href")).toBe(props.googleMapsUrl);
  });
  it("uses lazy image tiles and keeps coordinate links and attribution", () => {
    const { container } = render(<VenueMap {...props} />);
    const preview = screen.getByRole("link", { name: `View on map · ${props.name}` });
    const tiles = Array.from(container.querySelectorAll("img"));

    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((tile) =>
      tile.src.startsWith("https://tile.openstreetmap.org/15/") &&
      tile.getAttribute("loading") === "lazy",
    )).toBe(true);
    expect(preview.getAttribute("href")).toBe("https://www.google.com/maps/search/?api=1&query=11.9411827,108.4605052");
    expect(screen.getByRole("link", { name: /OpenStreetMap/ }).getAttribute("href")).toBe("https://www.openstreetmap.org/copyright");
    expect(screen.getByRole("link", { name: "Get directions" }).getAttribute("href")).toBe("https://www.google.com/maps/dir/?api=1&destination=11.9411827,108.4605052");
  });
});
