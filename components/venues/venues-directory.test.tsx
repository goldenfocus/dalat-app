import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VenuesDirectory } from "./venues-directory";
import type { VenueListItem, VenueType } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("@/components/venues/venue-type-filter", () => ({
  VenueTypeFilter: () => <div data-testid="venue-type-filter" />,
}));

vi.mock("@/components/venues/venue-card", () => ({
  VenueCard: ({ venue }: { venue: VenueListItem }) => <div>{venue.name}</div>,
}));

function venue(id: string, name: string, slug: string): VenueListItem {
  return {
    id,
    slug,
    name,
    venue_type: "community_center",
    logo_url: null,
    cover_photo_url: null,
    address: "Đà Lạt",
    is_verified: false,
    price_range: null,
    tags: [],
    operating_hours: null,
    upcoming_event_count: 0,
    has_happening_now: false,
  };
}

const venues = [
  venue("1", "PHỐ BÊN ĐỒI", "phobendoi"),
  venue("2", "ThomWork Coworking", "thomwork-coworking"),
];

describe("VenuesDirectory search", () => {
  it("finds the canonical Vietnamese name from an unaccented query", () => {
    render(
      <VenuesDirectory
        venues={venues}
        typeCounts={{ community_center: 2 } as Record<VenueType, number>}
      />
    );

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Pho Ben Doi" },
    });

    expect(screen.getByText("PHỐ BÊN ĐỒI")).toBeInTheDocument();
    expect(screen.queryByText("ThomWork Coworking")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("venues.searchResults");
  });

  it("offers a truthful clear-search action when there are no matches", () => {
    render(
      <VenuesDirectory
        venues={venues}
        typeCounts={{ community_center: 2 } as Record<VenueType, number>}
      />
    );

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Hillside Street" },
    });

    expect(screen.getByText("venues.noVenues")).toBeInTheDocument();
    const clearButtons = screen.getAllByRole("button", {
      name: "home.search.clearSearch",
    });
    fireEvent.click(clearButtons[0]);

    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByText("PHỐ BÊN ĐỒI")).toBeInTheDocument();
    expect(screen.getByText("ThomWork Coworking")).toBeInTheDocument();
  });
});
