import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { isVideoUrl } from "@/lib/media-utils";

export const runtime = "edge";
export const alt = "Moment on ĐàLạt.app";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

export default async function OGImage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: moment } = await supabase
    .from("moments")
    .select("id, text_content, media_url, content_type, created_at, profiles(display_name, username, avatar_url), events(title, image_url)")
    .eq("id", id)
    .single();

  // Supabase returns profiles/events as arrays due to join typing, but .single() ensures one record
  const profile = Array.isArray(moment?.profiles) ? moment.profiles[0] : moment?.profiles;
  const event = Array.isArray(moment?.events) ? moment.events[0] : moment?.events;
  const userName = profile?.display_name || profile?.username || "Someone";
  const eventTitle = event?.title || "Da Lat event";
  const isVideo = moment?.media_url ? isVideoUrl(moment.media_url) : false;

  if (moment?.media_url && !isVideo && moment.content_type !== "text") {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            position: "relative",
          }}
        >
          <img
            src={moment.media_url}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0.2))",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              padding: 48,
            }}
          >
            <div
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: "white",
                lineHeight: 1.2,
                marginBottom: 12,
              }}
            >
              {eventTitle.length > 60 ? `${eventTitle.slice(0, 57)}...` : eventTitle}
            </div>
            <div
              style={{
                fontSize: 24,
                color: "rgba(255,255,255,0.9)",
              }}
            >
              {userName} · ĐàLạt.app
            </div>
          </div>
        </div>
      ),
      { ...size }
    );
  }

  const fallbackText = moment?.text_content
    ? moment.text_content.slice(0, 140)
    : `${userName} shared a moment from ${eventTitle}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 56,
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)",
          color: "white",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 600 }}>ĐàLạt.app</div>
        <div style={{ fontSize: 50, fontWeight: 700, lineHeight: 1.2 }}>
          {eventTitle.length > 48 ? `${eventTitle.slice(0, 45)}...` : eventTitle}
        </div>
        <div style={{ fontSize: 26, opacity: 0.9 }}>{fallbackText}</div>
      </div>
    ),
    { ...size }
  );
}
