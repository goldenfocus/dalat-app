import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventLocation } from "./event-location";

vi.mock("@/lib/i18n/routing", () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
const location = { location_name: "Social House Dalat", address: "184 Đường Tô Ngọc Vân", latitude: 11.9467648, longitude: 108.4341887 };
const labels = { directionsLabel: "Chỉ đường trên Google Maps", mapLabel: "Xem bản đồ" };

describe("prominent event location", () => {
  it("links the venue and renders localized directions to its precise pin", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<EventLocation location={location} venue={{ ...location, id: "venue", name: location.location_name, slug: "social-house-dalat", google_maps_url: null }} {...labels} />);
    expect(screen.getByRole("link", { name: "Social House Dalat" })).toHaveAttribute("href", "/venues/social-house-dalat");
    expect(screen.getByRole("link", { name: labels.directionsLabel })).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=11.9467648,108.4341887");
    expect(screen.getByRole("link", { name: labels.mapLabel })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=11.9467648,108.4341887");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: location.address })); });
    expect(writeText).toHaveBeenCalledWith(location.address);
  });
  it("keeps a private-address lock without inventing a map target", () => {
    render(<EventLocation location={{}} {...labels}><p>RSVP to see the address</p></EventLocation>);
    expect(screen.getByText("RSVP to see the address")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("preserves a standalone saved map link when there is no pin", () => {
    render(<EventLocation location={{ address: "Custom address", google_maps_url: "https://maps.app.goo.gl/example" }} {...labels} />);
    expect(screen.getByRole("link", { name: labels.mapLabel })).toHaveAttribute("href", "https://maps.app.goo.gl/example");
    expect(screen.queryByRole("link", { name: labels.directionsLabel })).not.toBeInTheDocument();
  });
});
