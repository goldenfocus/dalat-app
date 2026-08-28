import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GuidePlaceCard } from "@/components/blog/guide-place-card";

const place = {
  position: 1,
  name: "Daily Log Coffee",
  type: "Work café",
  description: "A useful place to work.",
  address: "15 Thông Thiên Học, Da Lat",
  hours: "Daily, 7:30 AM–10:30 PM",
  detailsUrl: "https://example.com/details",
  detailsLabel: "Official site",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=Daily+Log",
  imageUrl: "https://cdn.dalat.app/example.webp",
  imageAlt: "A work table at Daily Log Coffee",
  imageCredit: "Daily Log Coffee",
  categoryLinks: [{ label: "Da Lat cafés", href: "/cafes" }],
  caveat: "A public café, so noise can vary.",
  sourceUrl: "https://example.com/source",
  sourceLabel: "Daily Log Coffee",
};

describe("GuidePlaceCard", () => {
  it("renders useful facts, a category link, and single-line actions", () => {
    render(<GuidePlaceCard place={place} />);

    expect(screen.getByText(place.hours)).toBeInTheDocument();
    expect(screen.getByText(place.address)).toBeInTheDocument();
    expect(screen.getByAltText(place.imageAlt)).toHaveAttribute(
      "src",
      place.imageUrl
    );
    expect(screen.getByRole("link", { name: "Official site" })).toHaveAttribute(
      "href",
      place.detailsUrl
    );
    expect(screen.getByRole("link", { name: "Directions" })).toHaveAttribute(
      "href",
      place.mapUrl
    );
    expect(screen.getByRole("link", { name: "Da Lat cafés" })).toHaveAttribute(
      "href",
      "/cafes"
    );
    expect(screen.queryByText(/Source:/u)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Official site" })).toHaveClass(
      "whitespace-nowrap"
    );
    expect(screen.getByRole("link", { name: "Directions" })).toHaveClass(
      "whitespace-nowrap"
    );
  });
});
