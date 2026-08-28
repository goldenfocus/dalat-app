import { ImageResponse } from "next/og";
import { createStaticClient } from "@/lib/supabase/server";
import {
  ACTIVITY_FACT_ART_SIZE,
  buildActivityFactArtModel,
  formatActivityFactArtDate,
  parseActivityFactArtPath,
  type ActivityFactArtInput,
  type ActivityFactArtModel,
} from "@/lib/activity-graph/fact-art";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ kind: string; file: string }>;
}

const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

function imageError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": status === 404 ? "public, max-age=60" : "no-store",
    },
  });
}

async function loadFactArtInput(
  kind: "event" | "series",
  slug: string,
): Promise<ActivityFactArtInput | null | undefined> {
  const supabase = createStaticClient();
  if (!supabase) return undefined;

  if (kind === "event") {
    const { data, error } = await supabase
      .from("events")
      .select("title, starts_at, location_name")
      .eq("slug", slug)
      .eq("status", "published")
      .eq("source_platform", "activity-graph")
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      kind,
      slug,
      title: data.title,
      startsAt: data.starts_at,
      venue: data.location_name,
    };
  }

  const { data: series, error: seriesError } = await supabase
    .from("event_series")
    .select("id, title, starts_at_time, location_name")
    .eq("slug", slug)
    .eq("status", "active")
    .eq("source_platform", "activity-graph")
    .maybeSingle();

  if (seriesError) throw seriesError;
  if (!series) return null;

  const { data: nextEvent } = await supabase
    .from("events")
    .select("starts_at")
    .eq("series_id", series.id)
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const time = series.starts_at_time?.slice(0, 5);

  return {
    kind,
    slug,
    title: series.title,
    startsAt: nextEvent?.starts_at ?? null,
    scheduleText: nextEvent?.starts_at
      ? `NEXT · ${formatActivityFactArtDate(nextEvent.starts_at)}`
      : time
        ? `RECURRING · ${time}`
        : "Recurring activity",
    venue: series.location_name,
  };
}

function FactArt({ model }: { model: ActivityFactArtModel }) {
  const { palette } = model;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        color: "white",
        background: `linear-gradient(145deg, ${palette.from}, ${palette.to})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "radial-gradient(circle at 18% 8%, rgba(255,255,255,0.18) 0%, transparent 32%), radial-gradient(circle at 90% 92%, rgba(0,0,0,0.42) 0%, transparent 48%)",
        }}
      />

      {/* Typographic travel-poster geometry: decorative, but never fake media. */}
      <div
        style={{
          position: "absolute",
          width: 820,
          height: 820,
          borderRadius: 999,
          border: "2px solid rgba(255,255,255,0.16)",
          top: -360,
          right: -280,
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 560,
          height: 560,
          borderRadius: 999,
          background: "rgba(255,255,255,0.055)",
          bottom: -260,
          left: -170,
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 48,
          right: 66,
          fontSize: 300,
          lineHeight: 1,
          opacity: 0.17,
          display: "flex",
        }}
      >
        {palette.glyph}
      </div>

      <div
        style={{
          width: "100%",
          height: "100%",
          padding: "82px 76px 72px",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 31,
              fontWeight: 800,
              letterSpacing: -1,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: "rgba(255,255,255,0.16)",
                border: "1px solid rgba(255,255,255,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 25,
                fontWeight: 900,
              }}
            >
              Đ
            </div>
            ĐàLạt.app
          </div>
          <div
            style={{
              display: "flex",
              padding: "12px 20px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.28)",
              background: "rgba(0,0,0,0.12)",
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: 3,
            }}
          >
            {model.kind === "series" ? "SERIES" : "EVENT"}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            maxWidth: 1020,
            paddingTop: 70,
            paddingBottom: 60,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginBottom: 34,
              color: palette.accent,
              fontSize: 21,
              fontWeight: 800,
              letterSpacing: 5,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 52,
                height: 4,
                borderRadius: 99,
                background: palette.accent,
              }}
            />
            {model.eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: model.titleFontSize,
              fontWeight: 850,
              letterSpacing: -2.5,
              lineHeight: 1.08,
              textWrap: "balance",
            }}
          >
            {model.title}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            borderTop: "1px solid rgba(255,255,255,0.28)",
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "30px 2px 27px",
              alignItems: "center",
              gap: 24,
              borderBottom: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                width: 124,
                flexShrink: 0,
                color: "rgba(255,255,255,0.62)",
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: 4,
              }}
            >
              WHEN
            </div>
            <div style={{ display: "flex", fontSize: 29, fontWeight: 650 }}>
              {model.date}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "27px 2px 30px",
              alignItems: "center",
              gap: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 124,
                flexShrink: 0,
                color: "rgba(255,255,255,0.62)",
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: 4,
              }}
            >
              WHERE
            </div>
            <div style={{ display: "flex", fontSize: 29, fontWeight: 650 }}>
              {model.venue}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 30,
            color: "rgba(255,255,255,0.62)",
            fontSize: 17,
            letterSpacing: 1.5,
          }}
        >
          <span>LIVE DETAILS · DALAT.APP</span>
          <span>VIETNAM · 11.94° N</span>
        </div>
      </div>
    </div>
  );
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { kind: kindSegment, file } = await params;
  const parsed = parseActivityFactArtPath(kindSegment, file);
  if (!parsed) return imageError("Not found", 404);

  let input: ActivityFactArtInput | null | undefined;
  try {
    input = await loadFactArtInput(parsed.kind, parsed.slug);
  } catch (error) {
    console.error("[activity-fact-art] Could not load activity facts", error);
    return imageError("Image temporarily unavailable", 503);
  }

  if (input === undefined)
    return imageError("Image temporarily unavailable", 503);
  if (input === null) return imageError("Not found", 404);

  const image = new ImageResponse(
    <FactArt model={buildActivityFactArtModel(input)} />,
    ACTIVITY_FACT_ART_SIZE,
  );

  return new Response(image.body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${parsed.slug}.png"`,
      "Cache-Control": CACHE_CONTROL,
      "Access-Control-Allow-Origin": "*",
      "X-Robots-Tag": "index, follow, max-image-preview:large",
    },
  });
}
