import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/routing", () => ({
  locales: [
    "en",
    "vi",
    "ko",
    "zh",
    "ru",
    "fr",
    "ja",
    "ms",
    "th",
    "de",
    "es",
    "id",
  ],
}));
import { buildEventSeriesMetadata, seriesSocialImageUrl } from "./seo";

const series = {
  slug: "nightly-acoustic",
  title: "Nightly acoustic",
  image_url: null,
  source_platform: "activity-graph",
};

describe("event series SEO metadata", () => {
  it("uses a real series image before the fact-art fallback", () => {
    expect(
      seriesSocialImageUrl({
        ...series,
        image_url: "https://official.example/poster.webp",
      }),
    ).toBe(
      "https://dalat.app/cdn-cgi/image/width=1200,height=630,fit=cover,quality=82,format=jpeg/https://official.example/poster.webp",
    );
  });

  it("uses deterministic fact-art for an Activity Graph series without media", () => {
    expect(seriesSocialImageUrl(series)).toBe(
      "https://dalat.app/cdn-cgi/image/width=1200,height=630,fit=cover,quality=82,format=jpeg/https://dalat.app/activity-art/series/nightly-acoustic.png",
    );
  });

  it("emits localized canonical, Open Graph, and Twitter metadata", () => {
    const metadata = buildEventSeriesMetadata({
      series,
      locale: "vi",
      description: "Nhạc acoustic hằng đêm tại Đà Lạt.",
    });

    expect(metadata.alternates?.canonical).toBe(
      "https://dalat.app/vi/series/nightly-acoustic",
    );
    expect(metadata.openGraph).toMatchObject({
      title: "Nightly acoustic",
      description: "Nhạc acoustic hằng đêm tại Đà Lạt.",
      locale: "vi",
      url: "https://dalat.app/vi/series/nightly-acoustic",
      images: [
        expect.objectContaining({
          width: 1200,
          height: 630,
          alt: "Nightly acoustic",
        }),
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Nightly acoustic",
      description: "Nhạc acoustic hằng đêm tại Đà Lạt.",
    });
  });

  it("keeps the site image for legacy series whose fact-art route is unavailable", () => {
    expect(seriesSocialImageUrl({ ...series, source_platform: null })).toBe(
      "https://dalat.app/og-image.png?v=2",
    );
  });
});
