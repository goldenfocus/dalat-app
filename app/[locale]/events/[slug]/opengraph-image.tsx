import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { formatInDaLat } from "@/lib/timezone";
import { getTranslationsWithFallback, isValidContentLocale } from "@/lib/translations";
import type { ContentLocale } from "@/lib/types";

export const runtime = "edge";
export const alt = "Event on dalat.app";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ slug: string; locale: string }>;
}

export default async function OGImage({ params }: Props) {
  const { slug, locale } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, image_url, location_name, starts_at")
    .eq("slug", slug)
    .single();

  // Get translated title for the current locale
  let title = event?.title || "Event";
  if (event && isValidContentLocale(locale)) {
    const translations = await getTranslationsWithFallback(
      "event",
      event.id,
      locale as ContentLocale,
      {
        title: event.title,
        description: event.description,
        text_content: null,
        bio: null,
      }
    );
    title = translations.title || event.title;
  }

  // If event has its own image, use that directly
  if (event?.image_url) {
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
          {/* Event image as background */}
          <img
            src={event.image_url}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          {/* Gradient overlay for text readability */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "50%",
              background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              padding: "48px",
            }}
          >
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: "white",
                lineHeight: 1.2,
                marginBottom: 16,
                textShadow: "0 2px 4px rgba(0,0,0,0.3)",
              }}
            >
              {title.length > 60
                ? title.slice(0, 57) + "..."
                : title}
            </div>
            <div
              style={{
                fontSize: 24,
                color: "rgba(255,255,255,0.9)",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <span>{formatInDaLat(event.starts_at, "EEE, MMM d · h:mm a")}</span>
              {event.location_name && (
                <>
                  <span style={{ opacity: 0.6 }}>·</span>
                  <span>{event.location_name}</span>
                </>
              )}
            </div>
          </div>
          {/* dalat.app branding */}
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
            dalat.app
          </div>
        </div>
      ),
      { ...size }
    );
  }

  // Fallback: Generate a branded image for events without custom images
  const eventDate = event
    ? formatInDaLat(event.starts_at, "EEE, MMM d · h:mm a")
    : "";
  const location = event?.location_name || "Da Lat";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          padding: 48,
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

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
            position: "relative",
          }}
        >
          {/* Top: dalat.app branding */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
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
            <span
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: "white",
              }}
            >
              dalat.app
            </span>
          </div>

          {/* Middle: Event details */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: "white",
                lineHeight: 1.1,
                maxWidth: "90%",
              }}
            >
              {title.length > 50 ? title.slice(0, 47) + "..." : title}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  color: "rgba(255,255,255,0.8)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {eventDate}
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: "rgba(255,255,255,0.8)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {location}
              </div>
            </div>
          </div>

          {/* Bottom: CTA */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                padding: "16px 32px",
                borderRadius: 12,
                fontSize: 24,
                fontWeight: 600,
                color: "white",
              }}
            >
              View Event
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
