import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import german from "@/messages/de.json";
import { CinemaEndCard } from "./cinema-mode/cinema-end-card";
import { ImmersiveMomentView } from "./immersive-moment-view";
import { MediaTypeFilterToggle } from "./media-type-filter";
import { ViewModeSwitcher } from "./view-mode-switcher";
import { FloatingViewModeSwitcher } from "./floating-view-mode-switcher";
import type { MomentWithProfile } from "@/lib/types";
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
vi.mock("@/components/ui/translated-content", () => ({
  TranslatedContent: ({ original }: { original: string }) => (
    <span>{original}</span>
  ),
}));
vi.mock("@/components/ui/user-avatar", () => ({
  UserAvatar: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));
vi.mock("./moment-video-player", () => ({ MomentVideoPlayer: () => null }));
vi.mock("./moment-watermark", () => ({ MomentWatermark: () => null }));
vi.mock("./related-events-section", () => ({
  RelatedEventsSection: () => null,
}));
vi.mock("./moment-actions-menu", () => ({ MomentActionsMenu: () => null }));
vi.mock("./moment-download-button", () => ({
  MomentDownloadButton: () => null,
  InAppBrowserDownloadHint: () => null,
}));
vi.mock("@/components/comments/comments-sheet", () => ({
  CommentsSheet: () => null,
}));
vi.mock("@/components/comments/immersive-comments-panel", () => ({
  ImmersiveCommentsPanel: () => null,
}));
vi.mock("@/components/reactions/reaction-bar", () => ({
  ReactionBar: () => null,
}));
const messages = {
  ...german,
  moments: {
    ...german.moments,
    viewModeLabel: "Ansicht",
    viewGrid: "Raster",
    viewImmersive: "Immersiv",
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
    albumComplete: "Album vollständig!",
    albumCompleteHint:
      "Erinnerungen erneut ansehen oder einen eigenen Moment hinzufügen.",
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
  it("localizes the immersive end screen and counts contributors beyond the avatar display cap", async () => {
    const moments = Array.from({ length: 10 }, (_, index) => ({
      id: `moment-${index}`,
      user_id: `user-${index}`,
      content_type: "text",
      text_content: "Source caption",
      media_url: null,
      created_at: "2026-10-28T00:00:00Z",
      display_name: `Author ${index}`,
      username: null,
      avatar_url: null,
    })) as MomentWithProfile[];
    localized(
      <ImmersiveMomentView
        moments={moments}
        initialIndex={9}
        eventId="event"
        eventSlug="language-night"
        onClose={vi.fn()}
        totalCount={18}
      />,
    );
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(await screen.findByText("Album vollständig!")).toBeTruthy();
    expect(screen.getByText("10 Mitwirkende")).toBeTruthy();
    expect(screen.getByText("18 Momente")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut ansehen" })).toBeTruthy();
    expect(screen.queryByText(/contributors made this happen/)).toBeNull();
  });
  it("localizes media filters and view-mode accessible names", () => {
    localized(
      <>
        <MediaTypeFilterToggle value="all" onChange={vi.fn()} />
        <ViewModeSwitcher viewMode="grid" onViewModeChange={vi.fn()} />
        <FloatingViewModeSwitcher
          viewMode="cinema"
          onViewModeChange={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    );
    expect(
      screen.getByRole("radiogroup", { name: "Medientyp filtern" }),
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Fotos" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Ansicht" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Kino" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kino" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("radiogroup", { name: "Filter by media type" }),
    ).toBeNull();
  });
});
