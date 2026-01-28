import { ImageResponse } from "next/og";
import { createStaticClient } from "@/lib/supabase/server";

// Use Node.js runtime for image processing
export const runtime = "nodejs";

// Force dynamic to ensure we can set cache headers
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string; locale: string }>;
}

const size = { width: 1200, height: 630 };

export async function GET(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const supabase = createStaticClient();

  let event: {
    id: string;
    title: string;
  } | null = null;

  let featuredMoment: {
    media_url: string;
    thumbnail_url: string | null;
    content_type: string;
  } | null = null;

  let momentCount = 0;

  if (supabase) {
    // Get event info
    const { data: eventData } = await supabase
      .from("events")
      .select("id, title")
      .eq("slug", slug)
      .single();
    event = eventData;

    if (event) {
      // Get the first (most recent) moment with an image
      const { data: moments } = await supabase
        .from("moments")
        .select("media_url, thumbnail_url, content_type")
        .eq("event_id", event.id)
        .eq("status", "published")
        .in("content_type", ["photo", "video"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (moments && moments.length > 0) {
        featuredMoment = moments[0];
      }

      // Get total moment count
      const { count } = await supabase
        .from("moments")
        .select("*", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("status", "published");

      momentCount = count ?? 0;
    }
  }

  const title = event?.title || "Moments";

  // Get the image URL (prefer thumbnail for videos)
  const imageUrl =
    featuredMoment?.content_type === "video"
      ? featuredMoment.thumbnail_url || featuredMoment.media_url
      : featuredMoment?.media_url;

  let imageResponse: ImageResponse;

  if (imageUrl) {
    // Show featured moment image with overlay
    imageResponse = new ImageResponse(
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
            src={imageUrl}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          {/* Gradient overlay */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "50%",
              background:
                "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              padding: "48px",
            }}
          >
            {/* Photo count badge */}
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
                  background: "rgba(255,255,255,0.2)",
                  backdropFilter: "blur(8px)",
                  padding: "8px 16px",
                  borderRadius: 20,
                  fontSize: 20,
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>
                  {momentCount} {momentCount === 1 ? "photo" : "photos"}
                </span>
              </div>
            </div>
            {/* Event title */}
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: "white",
                lineHeight: 1.2,
                textShadow: "0 2px 4px rgba(0,0,0,0.3)",
              }}
            >
              {title.length > 60 ? title.slice(0, 57) + "..." : title}
            </div>
          </div>
          {/* Brand badge */}
          <div
            style={{
              position: "absolute",
              top: 24,
              right: 24,
              background: "rgba(0,0,0,0.6)",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 20,
              color: "white",
              fontWeight: 600,
            }}
          >
            ĐàLạt.app
          </div>
        </div>
      ),
      { ...size }
    );
  } else {
    // Fallback when no moments exist - show elegant placeholder
    imageResponse = new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background:
              "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
            padding: 48,
            position: "relative",
          }}
        >
          {/* Decorative background */}
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
              flexDirection: "column",
              justifyContent: "space-between",
              height: "100%",
              position: "relative",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  fontWeight: 700,
                  color: "white",
                }}
              >
                d
              </div>
              <span style={{ fontSize: 28, fontWeight: 600, color: "white" }}>
                ĐàLạt.app
              </span>
            </div>
            {/* Content */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Camera icon */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 80,
                  height: 80,
                  borderRadius: 20,
                  background: "rgba(255,255,255,0.1)",
                }}
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.8)"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: "rgba(255,255,255,0.6)",
                  fontWeight: 500,
                }}
              >
                Moments
              </div>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  color: "white",
                  lineHeight: 1.1,
                  maxWidth: "90%",
                }}
              >
                {title.length > 50 ? title.slice(0, 47) + "..." : title}
              </div>
            </div>
            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  padding: "16px 32px",
                  borderRadius: 12,
                  fontSize: 24,
                  fontWeight: 600,
                  color: "white",
                }}
              >
                View Photos
              </div>
            </div>
          </div>
        </div>
      ),
      { ...size }
    );
  }

  // Create response with cache headers
  // Cache for 1 hour on CDN, stale-while-revalidate for 1 day
  const response = new Response(imageResponse.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });

  return response;
}
