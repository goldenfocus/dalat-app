import { ImageResponse } from "next/og";
import { createStaticClient } from "@/lib/supabase/server";
import { coverPalette } from "@/lib/blog/cover-palette";

// Use Node.js runtime for image processing (matches events og-image route)
export const runtime = "nodejs";
export const alt = "Blog post on ĐàLạt.app";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ locale: string; category: string; slug: string }>;
}

const wordmark = (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}
  >
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 22,
        fontWeight: 700,
        color: "white",
      }}
    >
      d
    </div>
    <span style={{ fontSize: 26, fontWeight: 600, color: "white" }}>
      ĐàLạt.app
    </span>
  </div>
);

export default async function OGImage({ params }: Props) {
  const { slug } = await params;

  let title = "ĐàLạt.app";
  let categoryName: string | null = null;
  let coverImageUrl: string | null = null;
  let seed = slug;

  // NEVER throw — any failure falls through to the designed gradient fallback
  try {
    const supabase = createStaticClient();
    if (supabase) {
      const { data } = await supabase.rpc("get_blog_post_by_slug", {
        p_slug: slug,
      });
      const post = data?.[0] as
        | {
            title: string;
            slug: string;
            cover_image_url: string | null;
            category_name: string | null;
          }
        | undefined;
      if (post) {
        title = post.title || title;
        categoryName = post.category_name || null;
        coverImageUrl = post.cover_image_url || null;
        seed = post.slug || slug;
      }
    }
  } catch (error) {
    // Fall through to the branded gradient fallback
    console.error("[og-image]", error);
  }

  const displayTitle = title.length > 90 ? title.slice(0, 87) + "..." : title;

  // Real cover image: full-bleed photo with bottom scrim + title + wordmark
  if (coverImageUrl) {
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
            src={coverImageUrl}
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
              bottom: 0,
              left: 0,
              right: 0,
              height: "55%",
              background:
                "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              padding: 48,
            }}
          >
            {categoryName && (
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.85)",
                  textTransform: "uppercase",
                  letterSpacing: 4,
                  marginBottom: 12,
                }}
              >
                {categoryName}
              </div>
            )}
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: "white",
                lineHeight: 1.2,
                textShadow: "0 2px 4px rgba(0,0,0,0.3)",
              }}
            >
              {displayTitle}
            </div>
          </div>
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
  }

  // No cover image: deterministic designed card (same system as GeneratedCover)
  const palette = coverPalette(seed);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: `linear-gradient(135deg, ${palette.from}, ${palette.to})`,
          padding: 56,
          position: "relative",
        }}
      >
        {/* Vignette + soft highlight for depth */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(circle at 18% 0%, rgba(255,255,255,0.09) 0%, transparent 55%), radial-gradient(circle at 100% 100%, rgba(0,0,0,0.38) 0%, transparent 62%)",
            display: "flex",
          }}
        />
        {/* Large translucent glyph in the corner */}
        <div
          style={{
            position: "absolute",
            top: -30,
            right: 30,
            fontSize: 220,
            opacity: 0.25,
            display: "flex",
          }}
        >
          {palette.glyph}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
            position: "relative",
          }}
        >
          {wordmark}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 20,
            }}
          >
            {categoryName && (
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.9)",
                  textTransform: "uppercase",
                  letterSpacing: 4,
                  padding: "8px 20px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.14)",
                  border: `1px solid ${palette.accent}`,
                }}
              >
                {categoryName}
              </div>
            )}
            <div
              style={{
                fontSize: 60,
                fontWeight: 700,
                color: "white",
                lineHeight: 1.15,
                maxWidth: "88%",
                textShadow: "0 2px 12px rgba(0,0,0,0.35)",
              }}
            >
              {displayTitle}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
