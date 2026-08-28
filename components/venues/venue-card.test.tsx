import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VenueCard } from "./venue-card";
import type { VenueListItem } from "@/lib/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/i18n/routing", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const venue: VenueListItem = {
  id: "venue-1",
  slug: "phobendoi",
  name: "PHỐ BÊN ĐỒI",
  venue_type: "community_center",
  logo_url: null,
  cover_photo_url: null,
  address: "Đà Lạt",
  is_verified: true,
  price_range: null,
  tags: [],
  operating_hours: null,
  upcoming_event_count: 0,
  has_happening_now: false,
};

describe("VenueCard", () => {
  it("renders the official venue name unchanged", () => {
    render(<VenueCard venue={venue} />);

    expect(
      screen.getByRole("heading", { name: "PHỐ BÊN ĐỒI" })
    ).toBeInTheDocument();
    expect(screen.queryByText("HILLSIDE STREET")).not.toBeInTheDocument();
  });
});
