import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventLocation } from "./event-location";

const location = { location_name: "Social House Dalat", address: "184 Đường Tô Ngọc Vân", latitude: 11.9467648, longitude: 108.4341887 };
const labels = { directionsLabel: "Chỉ đường trên Google Maps", mapLabel: "Xem bản đồ" };

describe("compact event location", () => {
  it("makes the name and address one map link to the precise pin", () => {
    render(<EventLocation location={location} {...labels} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(`${location.location_name} · ${labels.directionsLabel}`);
    expect(links[0]).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=11.9467648,108.4341887");
    expect(links[0]).toContainElement(screen.getByText(location.address));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it("keeps a private-address lock without inventing a map target", () => {
    render(<EventLocation location={{}} {...labels}><p>RSVP to see the address</p></EventLocation>);
    expect(screen.getByText("RSVP to see the address")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("preserves a standalone saved map link when there is no pin", () => {
    render(<EventLocation location={{ address: "Custom address", google_maps_url: "https://maps.app.goo.gl/example" }} {...labels} />);
    expect(screen.getByRole("link", { name: `Custom address · ${labels.mapLabel}` })).toHaveAttribute("href", "https://maps.app.goo.gl/example");
  });
});
