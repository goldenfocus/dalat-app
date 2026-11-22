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
    expect(screen.queryByTitle(`View on map · ${props.name}`)).toBeNull();
    expect(screen.getByText(props.address)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Get directions" }).getAttribute("href")).toBe(props.googleMapsUrl);
    expect(screen.getByRole("link", { name: "View on map" }).getAttribute("href")).toBe(props.googleMapsUrl);
  });
  it("shows a map with the same precise coordinates used for directions", () => {
    render(<VenueMap {...props} />);
    const frame = screen.getByTitle(`View on map · ${props.name}`);
    const embed = new URL(frame.getAttribute("src")!);

    expect(embed.origin + embed.pathname).toBe("https://www.openstreetmap.org/export/embed.html");
    expect(embed.searchParams.get("marker")).toBe(`${props.latitude},${props.longitude}`);
    expect(screen.getByRole("link", { name: "Get directions" }).getAttribute("href")).toBe("https://www.google.com/maps/dir/?api=1&destination=11.9411827,108.4605052");
  });
});
