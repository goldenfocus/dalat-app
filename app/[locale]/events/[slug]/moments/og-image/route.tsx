/* eslint-disable @next/next/no-img-element -- ImageResponse requires raw image elements. */
import { ImageResponse } from "next/og";
import { createStaticClient } from "@/lib/supabase/server";
import {
  buildCollageSourceUrl,
  selectEventPreviewImages,
  type SocialPreviewMoment,
} from "@/lib/events/share-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const size = { width: 1200, height: 630 };

export async function GET(_request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const supabase = createStaticClient();

  let event: {
    id: string;
    title: string;
    image_url: string | null;
    cover_moment_id: string | null;
  } | null = null;
  let moments: SocialPreviewMoment[] = [];

  if (supabase) {
    const { data: eventData } = await supabase
      .from("events")
      .select("id, title, image_url, cover_moment_id")
      .eq("slug", slug)
      .single();

    event = eventData;

    if (event) {
      const { data: galleryMoments } = await supabase.rpc("get_event_moments", {
        p_event_id: event.id,
        p_limit: 20,
        p_offset: 0,
      });

      moments = (galleryMoments ?? []) as SocialPreviewMoment[];

      if (event.cover_moment_id && !moments.some(({ id }) => id === event?.cover_moment_id)) {
        const { data: coverMoment } = await supabase
          .from("moments")
          .select("id, content_type, media_url, thumbnail_url, cf_video_uid, cf_playback_url")
          .eq("id", event.cover_moment_id)
          .eq("status", "published")
          .single();

        if (coverMoment) moments = [coverMoment, ...moments] as SocialPreviewMoment[];
      }
    }
  }

  const title = event?.title || "ĐàLạt.app";
  const images = selectEventPreviewImages(
    event?.image_url ?? null,
    event?.cover_moment_id ?? null,
    moments
  );
  const heroImage = images[0];
  const thumbnailImages = images.slice(1, 4);
  const heroWidth = thumbnailImages.length > 0 ? 780 : size.width;
  const thumbnailHeight = thumbnailImages.length > 0
    ? Math.floor(size.height / thumbnailImages.length)
    : size.height;

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(135deg, #172033 0%, #31445f 52%, #162d2a 100%)",
          color: "white",
        }}
      >
        <div
          style={{
            width: heroWidth,
            height: "100%",
            display: "flex",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {heroImage && (
            <img
              src={buildCollageSourceUrl(heroImage, heroWidth, size.height)}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: 42,
              background: heroImage
                ? "linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.03) 42%, rgba(0,0,0,0.82) 100%)"
                : "linear-gradient(135deg, rgba(119,102,198,0.22), rgba(73,176,142,0.18))",
            }}
          >
            <div
              style={{
                alignSelf: "flex-start",
                display: "flex",
                padding: "10px 16px",
                borderRadius: 10,
                background: "rgba(0,0,0,0.58)",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              ĐàLạt.app
            </div>
            <div
              style={{
                display: "flex",
                width: heroWidth - 84,
                maxHeight: 170,
                overflow: "hidden",
                fontSize: title.length > 58 ? 36 : 44,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                textShadow: "0 3px 18px rgba(0,0,0,0.55)",
              }}
            >
              {title.length > 76 ? `${title.slice(0, 73)}…` : title}
            </div>
          </div>
        </div>

        {thumbnailImages.length > 0 && (
          <div
            style={{
              width: size.width - heroWidth,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              background: "#111827",
            }}
          >
            {thumbnailImages.map((imageUrl, index) => (
              <div
                key={imageUrl}
                style={{
                  width: "100%",
                  height: index === thumbnailImages.length - 1
                    ? size.height - thumbnailHeight * index
                    : thumbnailHeight,
                  display: "flex",
                  overflow: "hidden",
                  borderLeft: "5px solid #111827",
                  borderTop: index === 0
                    ? "0 solid transparent"
                    : "5px solid #111827",
                }}
              >
                <img
                  src={buildCollageSourceUrl(
                    imageUrl,
                    size.width - heroWidth,
                    thumbnailHeight
                  )}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    size
  );

  return new Response(imageResponse.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
