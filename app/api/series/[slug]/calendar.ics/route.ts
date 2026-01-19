import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { format, parseISO } from "date-fns";

const DALAT_TIMEZONE = "Asia/Ho_Chi_Minh";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * Escape special characters for ICS format
 */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Format date for ICS (YYYYMMDDTHHmmss)
 */
function formatICSDate(dateStr: string, timeStr: string): string {
  // timeStr is in format HH:MM:SS
  const timeParts = timeStr.split(":");
  const time = `${timeParts[0]}${timeParts[1]}${timeParts[2] || "00"}`;
  const date = dateStr.replace(/-/g, "");
  return `${date}T${time}`;
}

/**
 * Format UNTIL for RRULE (YYYYMMDDTHHmmssZ)
 */
function formatRRuleUntil(dateStr: string): string {
  const date = parseISO(dateStr);
  return format(date, "yyyyMMdd'T'HHmmss'Z'");
}

/**
 * GET /api/series/[slug]/calendar.ics - Download series as ICS with RRULE
 */
export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createClient();

  // Get series with full details
  const { data: series, error: fetchError } = await supabase
    .from("event_series")
    .select(
      `
      *,
      profiles:created_by (display_name)
    `
    )
    .eq("slug", slug)
    .single();

  if (fetchError || !series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  // Get exception dates (cancelled instances)
  const { data: exceptions } = await supabase
    .from("series_exceptions")
    .select("original_date, exception_type")
    .eq("series_id", series.id)
    .eq("exception_type", "cancelled");

  // Build location string
  let location = "";
  if (series.address) {
    location = series.address;
  } else if (series.location_name) {
    location = `${series.location_name}, Đà Lạt, Vietnam`;
  }

  // Build description
  let description = series.description || "";
  if (series.google_maps_url) {
    description += `\\n\\nLocation: ${series.google_maps_url}`;
  }
  description += `\\n\\nSeries page: https://dalat.app/series/${series.slug}`;

  // Build RRULE with UNTIL if set
  let rrule = series.rrule;
  if (series.rrule_until) {
    rrule += `;UNTIL=${formatRRuleUntil(series.rrule_until)}`;
  }

  // Generate unique ID for the event
  const uid = `series-${series.id}@dalat.app`;
  const nowFormatted = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");

  // Build ICS content
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//dalat.app//Recurring Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + escapeICS(series.title),
    "X-WR-TIMEZONE:" + DALAT_TIMEZONE,
    "",
    // Timezone definition
    "BEGIN:VTIMEZONE",
    "TZID:" + DALAT_TIMEZONE,
    "X-LIC-LOCATION:" + DALAT_TIMEZONE,
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0700",
    "TZOFFSETTO:+0700",
    "TZNAME:ICT",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
    "",
    // The recurring event
    "BEGIN:VEVENT",
    `DTSTART;TZID=${DALAT_TIMEZONE}:${formatICSDate(series.first_occurrence, series.starts_at_time)}`,
    `DURATION:PT${series.duration_minutes}M`,
    `RRULE:${rrule}`,
    `DTSTAMP:${nowFormatted}`,
    `UID:${uid}`,
    `SUMMARY:${escapeICS(series.title)}`,
    `DESCRIPTION:${escapeICS(description)}`,
  ];

  if (location) {
    lines.push(`LOCATION:${escapeICS(location)}`);
  }

  lines.push(`URL:https://dalat.app/series/${series.slug}`);

  // Add organizer if we have creator info
  if (series.profiles?.display_name) {
    lines.push(`ORGANIZER;CN=${escapeICS(series.profiles.display_name)}:mailto:noreply@dalat.app`);
  }

  // Add EXDATE for cancelled instances
  if (exceptions && exceptions.length > 0) {
    for (const ex of exceptions) {
      const exDate = formatICSDate(ex.original_date, series.starts_at_time);
      lines.push(`EXDATE;TZID=${DALAT_TIMEZONE}:${exDate}`);
    }
  }

  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  const icsContent = lines.join("\r\n");

  // Return as ICS file
  return new NextResponse(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${series.slug}.ics"`,
    },
  });
}
