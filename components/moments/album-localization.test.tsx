import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
import german from "@/messages/de.json";
import { CinemaEndCard } from "./cinema-mode/cinema-end-card";
import { EventGalleryHeading } from "./event-gallery-heading";
import { MomentsViewContainer } from "./moments-view-container";
import type { MomentWithProfile } from "@/lib/types";
vi.mock("./infinite-moment-grid", () => ({
  InfiniteMomentGrid: () => <div data-testid="gallery-grid" />,
}));
vi.mock("next/dynamic", () => ({
  default: () => ({ onClose }: { onClose: () => void }) => (
    <div role="dialog"><button onClick={onClose}>Kino schließen</button></div>
  ),
}));
const mocks = vi.hoisted(() => ({ share: vi.fn() }));
vi.mock("@/lib/hooks/use-share", () => ({
  useShare: () => ({ share: mocks.share, copied: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/haptics", () => ({ triggerHaptic: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));
vi.mock("./moment-download-button", () => ({
  AlbumDownloadButton: () => null,
  InAppBrowserDownloadHint: () => null,
}));
vi.mock("@/components/ui/user-avatar", () => ({
  UserAvatar: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));
const messages = {
  ...german,
  moments: {
    ...german.moments,
    viewCinema: "Kino",
    filterMediaType: "Medientyp filtern",
    filterAll: "Alle",
    filterPhotos: "Fotos",
    filterVideos: "Videos",
    albumStats: "{count, plural, one {# Moment} other {# Momente}}",
    albumStatsWithContributors:
      "{count, plural, one {# Moment} other {# Momente}} · {contributors, plural, one {# Mitwirkender} other {# Mitwirkende}}",
    albumContributors:
      "{count, plural, one {# Mitwirkender} other {# Mitwirkende}}",
    shareAlbum: "Dieses Album teilen",
    replay: "Erneut ansehen",
    madeWith: "Erstellt mit",
  },
};
const localized = (children: React.ReactNode) =>
  render(
    <NextIntlClientProvider
      locale="de"
      timeZone="Asia/Ho_Chi_Minh"
      messages={messages}
    >
      {children}
    </NextIntlClientProvider>,
  );
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => ({ total_count: 0 }) })),
  ),
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("localized album journey", () => {
  it("localizes cinema stats/actions and shares the current-language album URL", () => {
    const replay = vi.fn(),
      add = vi.fn(),
      browse = vi.fn();
    localized(
      <CinemaEndCard
        eventMeta={{
          title: "Sprachaustausch",
          date: "2026-10-28",
          locationName: "Social House Dalat",
          imageUrl: null,
        }}
        eventSlug="language-night"
        totalMoments={18}
        contributors={[
          { id: "a", name: "Alice", avatar: null },
          { id: "b", name: "Bob", avatar: null },
        ]}
        onReplay={replay}
        onAddMoment={add}
        onBrowseAll={browse}
      />,
    );
    expect(screen.getByText("18 Momente · 2 Mitwirkende")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Dieses Album teilen" }),
    );
    expect(mocks.share).toHaveBeenCalledWith({
      title: "Sprachaustausch",
      text: "Sprachaustausch — 18 Momente",
      url: `${window.location.origin}/de/events/language-night/moments?view=cinema`,
    });
    fireEvent.click(screen.getByRole("button", { name: "Erneut ansehen" }));
    expect(replay).toHaveBeenCalledOnce();
    expect(screen.queryByText("Share this album")).toBeNull();
  });
  it("shows the grid even with a saved Cinema preference, and opens Cinema on request", async () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === "dalat-moments-view-mode" ? "cinema" : null });
    const moments = [
      { id: "photo", content_type: "photo", media_url: "/photo.jpg" },
      { id: "video", content_type: "video", media_url: "/video.mp4", video_status: "ready" },
    ] as MomentWithProfile[];
    localized(
      <MomentsViewContainer
        eventId="event"
        eventSlug="language-night"
        initialMoments={moments}
        initialHasMore={false}
        totalCount={2}
      />,
    );
    expect(screen.getByTestId("gallery-grid")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("group", { name: "Medientyp filtern" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fotos" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Immersiv" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Kino" }));
    const cinema = await screen.findByRole("dialog");
    fireEvent.click(within(cinema).getByRole("button", { name: "Kino schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("gallery-grid")).toBeVisible();
  });

  it("shows a localized event link and keeps original text outside it", () => {
    localized(
      <EventGalleryHeading
        locale="de"
        slug="language-night"
        title="Language Night"
        translatedTitle="Sprachaustausch"
        description="A night of **conversation**."
        translatedDescription="Ein Abend voller **Gespräche**."
        date="2026-10-28T20:00:00Z"
        imageUrl={null}
        locationName={null}
      />,
    );
    const eventLink = screen.getByRole("link", { name: /Sprachaustausch/ });
    expect(eventLink).toHaveAttribute("href", "/events/language-night");
    expect(screen.getByText("Ein Abend voller Gespräche.")).toBeVisible();
    expect(screen.getByText("Language Night A night of **conversation**.", { exact: false }).closest("details"))
      .not.toBeNull();
    expect(eventLink.querySelector("summary")).toBeNull();
  });
});
