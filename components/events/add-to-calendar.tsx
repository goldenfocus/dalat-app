"use client";

import { CalendarPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCalendarLocation } from "@/lib/events/location";
import { formatInDaLat, DALAT_TIMEZONE } from "@/lib/timezone";

interface AddToCalendarProps {
  title: string;
  description?: string | null;
  locationName?: string | null;
  address?: string | null;
  googleMapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  startsAt: string;
  endsAt?: string | null;
  url: string;
  uid?: string;
  locationLabel?: string;
  pageLabel?: string;
  // For recurring events: provide series slug to show "Add entire series" option
  seriesSlug?: string | null;
}

// Format date for Google Calendar (YYYYMMDDTHHmmss)
function formatDateForGoogle(isoString: string): string {
  return formatInDaLat(isoString, "yyyyMMdd'T'HHmmss");
}

function formatDateForICS(isoString: string): string {
  return new Date(isoString).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function endOfCalendarEvent(startsAt: string, endsAt?: string | null): string {
  return endsAt || new Date(Date.parse(startsAt) + 2 * 60 * 60 * 1000).toISOString();
}

function escapeCalendarText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/([;,])/g, "\\$1");
}

function foldCalendarLine(line: string, encoder: TextEncoder): string {
  let length = 0;
  let output = "";
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (length + bytes > 75) {
      output += "\r\n ";
      length = 1;
    }
    output += character;
    length += bytes;
  }
  return output;
}

function calendarDetails({ description, url, pageLabel = "Event page", locationLabel = "Location" }: AddToCalendarProps, mapUrl: string | null) {
  return [description, mapUrl && `${locationLabel}: ${mapUrl}`, `${pageLabel}: ${url}`].filter(Boolean).join("\n\n");
}

function eventLocation({ locationName, address, googleMapsUrl, latitude, longitude }: AddToCalendarProps) {
  return getCalendarLocation({
    location_name: locationName,
    address,
    google_maps_url: googleMapsUrl,
    latitude,
    longitude,
  });
}

function generateGoogleCalendarUrl(props: AddToCalendarProps): string {
  const { title, startsAt, endsAt } = props;
  const endTime = endOfCalendarEvent(startsAt, endsAt);
  const place = eventLocation(props);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatDateForGoogle(startsAt)}/${formatDateForGoogle(endTime)}`,
    details: calendarDetails(props, place.mapUrl),
    location: place.text,
    ctz: DALAT_TIMEZONE,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateICSContent(props: AddToCalendarProps): string {
  const { title, startsAt, endsAt, url, uid = `${Date.parse(startsAt)}@dalat.app` } = props;
  const place = eventLocation(props);
  const encoder = new TextEncoder();

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//dalat.app//Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `DTSTART:${formatDateForICS(startsAt)}`,
    `DTEND:${formatDateForICS(endOfCalendarEvent(startsAt, endsAt))}`,
    `DTSTAMP:${formatDateForICS(new Date().toISOString())}`,
    `UID:${escapeCalendarText(uid)}`,
    `SUMMARY:${escapeCalendarText(title)}`,
    `DESCRIPTION:${escapeCalendarText(calendarDetails(props, place.mapUrl))}`,
    `LOCATION:${escapeCalendarText(place.text)}`,
    ...(place.geo ? [`GEO:${place.geo}`] : []),
    `URL:${new URL(url, window.location.origin).href}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].map(line => foldCalendarLine(line, encoder)).join("\r\n");
}

function downloadICS(props: AddToCalendarProps) {
  const icsContent = generateICSContent(props);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${props.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "calendar"}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Keep the file available while the browser hands the download off.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

interface AddToCalendarComponentProps extends AddToCalendarProps {
  /** Use higher z-index for modal contexts (e.g., inside celebration modal) */
  inModal?: boolean;
}

export function AddToCalendar({ inModal, ...props }: AddToCalendarComponentProps) {
  const t = useTranslations("calendar");
  const googleUrl = generateGoogleCalendarUrl(props);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <CalendarPlus className="w-4 h-4 mr-2" />
          {t("addToCalendar")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className={inModal ? "w-56 z-[10002]" : "w-56"}
      >
        <DropdownMenuItem asChild>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer">
            {t("googleCalendar")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadICS(props)}>
          {t("appleOutlook")}
        </DropdownMenuItem>
        {props.seriesSlug && (
          <>
            <div className="h-px bg-border my-1" />
            <DropdownMenuItem asChild>
              <a
                href={`/api/series/${props.seriesSlug}/calendar.ics`}
                download
                className="text-primary"
              >
                {t("addEntireSeries")}
              </a>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
