import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentCard } from "./moment-card";
import { MomentsPreview } from "./moments-preview";
import { PastEventMomentsShowcase } from "./past-event-moments-showcase";
import { MomentAiInsights } from "./moment-ai-insights";
import type { MomentWithProfile } from "@/lib/types";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/i18n/routing", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/components/shared/material-renderers", () => ({
  getYouTubeThumbnail: () => "",
}));
vi.mock("@/lib/haptics", () => ({ triggerHaptic: vi.fn() }));
vi.mock("@/components/ui/translated-content", () => ({
  TranslatedContent: ({
    id,
    field,
    original,
    textClassName,
  }: {
    id: string;
    field: string;
    original: string;
    textClassName?: string;
  }) => (
    <span data-translation={`${id}:${field}`}>
      <span className={textClassName}>{original}</span>
      <button
        type="button"
        aria-label="Original"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        Original
      </button>
    </span>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const moment = {
  id: "moment-id",
  content_type: "text",
  media_url: null,
  text_content: "A long source caption",
  cf_video_uid: null,
} as MomentWithProfile;

describe("translated moment surfaces", () => {
  it("keeps card original controls outside the lightbox button", () => {
    const open = vi.fn();
    const { container } = render(
      <MomentCard moment={moment} onLightboxOpen={open} />,
    );
    expect(container.querySelector("button button, a button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: moment.text_content! }));
    expect(open).toHaveBeenCalledOnce();
  });

  it.each([MomentsPreview, PastEventMomentsShowcase])(
    "keeps preview originals outside tile navigation",
    (Component) => {
      const { container } = render(
        <Component
          eventSlug="event"
          moments={[moment]}
          counts={null}
          canPost={false}
        />,
      );
      expect(container.querySelector("a button, button button")).toBeNull();
      expect(screen.getByRole("button", { name: "Original" })).toBeTruthy();
      expect(
        container.querySelector('[data-translation="moment-id:text_content"]'),
      ).toBeTruthy();
    },
  );

  it("binds AI summaries and scenes to their stored translation fields", () => {
    const { container } = render(
      <MomentAiInsights
        momentId="moment-id"
        aiDescription="Description"
        sceneDescription="Scene"
        videoSummary="Video summary"
        audioSummary={null}
        pdfSummary={null}
        aiTags={null}
        detectedObjects={null}
        detectedText={null}
        mood={null}
        dominantColors={null}
        locationHints={null}
        contentType="video"
      />,
    );
    expect(
      container.querySelector('[data-translation="moment-id:video_summary"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-translation="moment-id:scene_description"]',
      ),
    ).toBeTruthy();
  });
});
