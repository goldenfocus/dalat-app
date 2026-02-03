import { ImageResponse } from "next/og";
import { createStaticClient } from "@/lib/supabase/server";

export const runtime = "edge";
export const alt = "Playlist on ĐàLạt.app";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ slug: string; locale: string }>;
}

export default async function OGImage({ params }: Props) {
  const { slug } = await params;
  const supabase = createStaticClient();

  let event: {
    id: string;
    title: string;
    image_url: string | null;
  } | null = null;

  let tracks: {
    title: string | null;
    artist: string | null;
    thumbnail_url: string | null;
    duration_seconds: number | null;
  }[] = [];

  if (supabase) {
    const { data: eventData } = await supabase
      .from("events")
      .select("id, title, image_url")
      .eq("slug", slug)
      .single();

    event = eventData;

    if (event) {
      // Get playlist for this event
      const { data: playlist } = await supabase
        .from("event_playlists")
        .select("id")
        .eq("event_id", event.id)
        .single();

      if (playlist) {
        const { data: tracksData } = await supabase
          .from("playlist_tracks")
          .select("title, artist, thumbnail_url, duration_seconds")
          .eq("playlist_id", playlist.id)
          .order("sort_order")
          .limit(4);

        tracks = tracksData || [];
      }
    }
  }

  const eventTitle = event?.title || "Playlist";
  const trackCount = tracks.length;
  const totalDuration = tracks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const durationMinutes = Math.round(totalDuration / 60);

  // Get thumbnail: first track's thumbnail, or event image
  const thumbnailUrl = tracks[0]?.thumbnail_url || event?.image_url;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          position: "relative",
        }}
      >
        {/* Background pattern */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.15) 0%, transparent 50%),
                              radial-gradient(circle at 80% 20%, rgba(255, 107, 107, 0.1) 0%, transparent 50%)`,
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            padding: 48,
            position: "relative",
          }}
        >
          {/* Left side - Album art */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              marginRight: 48,
            }}
          >
            <div
              style={{
                width: 320,
                height: 320,
                borderRadius: 24,
                overflow: "hidden",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              }}
            >
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <svg
                  width="120"
                  height="120"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="1.5"
                >
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              )}
            </div>
          </div>

          {/* Right side - Content */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flex: 1,
            }}
          >
            {/* Playlist badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 20,
                  padding: "8px 16px",
                  fontSize: 18,
                  color: "rgba(255,255,255,0.9)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                Playlist
              </div>
            </div>

            {/* Title */}
            <div
              style={{
                fontSize: 56,
                fontWeight: 700,
                color: "white",
                lineHeight: 1.1,
                marginBottom: 24,
              }}
            >
              {eventTitle.length > 40 ? eventTitle.slice(0, 37) + "..." : eventTitle}
            </div>

            {/* Stats */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                fontSize: 24,
                color: "rgba(255,255,255,0.8)",
              }}
            >
              <span>{trackCount} track{trackCount !== 1 ? "s" : ""}</span>
              {durationMinutes > 0 && (
                <>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <span>{durationMinutes} min</span>
                </>
              )}
            </div>

            {/* Branding */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 48,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "white",
                }}
              >
                d
              </div>
              <span style={{ fontSize: 24, fontWeight: 600, color: "white" }}>
                ĐàLạt.app
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
