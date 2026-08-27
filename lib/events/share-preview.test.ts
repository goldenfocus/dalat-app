import { describe, expect, it } from "vitest";
import {
  buildCollageSourceUrl,
  buildSocialCardImageUrl,
  getMomentPreviewImage,
  selectEventPreviewImages,
  type SocialPreviewMoment,
} from "./share-preview";

const moment = (
  overrides: Partial<SocialPreviewMoment> = {}
): SocialPreviewMoment => ({
  id: "m1",
  content_type: "photo",
  media_url: "https://cdn.dalat.app/moments/event/photo.jpg",
  thumbnail_url: null,
  cf_video_uid: null,
  cf_playback_url: null,
  ...overrides,
});

describe("event share preview images", () => {
  it("uses the event image as hero and the manually selected moment first", () => {
    const images = selectEventPreviewImages(
      "https://cdn.dalat.app/event-media/event/main.jpg",
      "m2",
      [
        moment(),
        moment({
          id: "m2",
          media_url: "https://cdn.dalat.app/moments/event/cover.jpg",
        }),
        moment({
          id: "m3",
          media_url: "https://cdn.dalat.app/moments/event/third.jpg",
        }),
      ]
    );

    expect(images).toEqual([
      "https://cdn.dalat.app/event-media/event/main.jpg",
      "https://cdn.dalat.app/moments/event/cover.jpg",
      "https://cdn.dalat.app/moments/event/photo.jpg",
      "https://cdn.dalat.app/moments/event/third.jpg",
    ]);
  });

  it("falls back to the selected cover moment when the event has no artwork", () => {
    const images = selectEventPreviewImages(null, "m2", [
      moment(),
      moment({
        id: "m2",
        media_url: "https://cdn.dalat.app/moments/event/cover.jpg",
      }),
    ]);

    expect(images[0]).toBe("https://cdn.dalat.app/moments/event/cover.jpg");
  });

  it("uses a stored or derived still image for videos, never the video file", () => {
    expect(
      getMomentPreviewImage(moment({
        content_type: "video",
        media_url: "https://cdn.dalat.app/moments/event/video.mp4",
        thumbnail_url: "https://cdn.dalat.app/moments/event/video.jpg",
      }))
    ).toBe("https://cdn.dalat.app/moments/event/video.jpg");

    expect(
      getMomentPreviewImage(moment({
        content_type: "video",
        media_url: null,
        thumbnail_url: null,
        cf_video_uid: "stream-uid",
      }))
    ).toContain("/stream-uid/thumbnails/thumbnail.jpg");
  });

  it("serves the final social card as a compact 1200x630 JPEG", () => {
    expect(buildSocialCardImageUrl("https://dalat.app/events/demo/og-image"))
      .toBe("https://dalat.app/cdn-cgi/image/width=1200,height=630,fit=cover,quality=82,format=jpeg/https://dalat.app/events/demo/og-image");

    expect(
      buildCollageSourceUrl(
        "https://cdn.dalat.app/moments/event/photo.png",
        760,
        630
      )
    ).toContain("width=760,height=630,fit=cover,quality=78,format=jpeg");
  });
});
