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
  // For recurring events: provide series slug to show "Add entire series" option
  seriesSlug?: string | null;
}

// Format date for Google Calendar (YYYYMMDDTHHmmss)
function formatDateForGoogle(isoString: string): string {
  return formatInDaLat(isoString, "yyyyMMdd'T'HHmmss");
}

// Format date for ICS (YYYYMMDDTHHmmss)
function formatDateForICS(isoString: string): string {
  return formatInDaLat(isoString, "yyyyMMdd'T'HHmmss");
}

// Add 2 hours to an ISO string
function addTwoHours(isoString: string): string {
  const date = new Date(isoString);
  date.setHours(date.getHours() + 2);
  return date.toISOString();
}

function generateGoogleCalendarUrl({
  title,
  description,
  locationName,
  address,
  googleMapsUrl,
  latitude,
  longitude,
  startsAt,
  endsAt,
  url,
}: AddToCalendarProps): string {
  // Default to 2 hours if no end time
  const endTime = endsAt || addTwoHours(startsAt);

  const place = getCalendarLocation({
    location_name: locationName,
    address,
    google_maps_url: googleMapsUrl,
    latitude,
    longitude,
  });

  let details = description || "";
  if (place.mapUrl) {
    details += `\n\nLocation: ${place.mapUrl}`;
  }
  details += `\n\nEvent page: ${url}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatDateForGoogle(startsAt)}/${formatDateForGoogle(endTime)}`,
    details: details.trim(),
    location: place.text,
    ctz: DALAT_TIMEZONE, // Display in Đà Lạt timezone
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateICSContent({
  title,
  description,
  locationName,
  address,
  googleMapsUrl,
  latitude,
  longitude,
  startsAt,
  endsAt,
  url,
}: AddToCalendarProps): string {
  // Default to 2 hours if no end time
  const endTime = endsAt || addTwoHours(startsAt);
  const nowFormatted = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const place = getCalendarLocation({
    location_name: locationName,
    address,
    google_maps_url: googleMapsUrl,
    latitude,
    longitude,
  });
  const mapLine = place.mapUrl ? `\\n\\nLocation: ${place.mapUrl}` : "";

  // ICS with timezone (TZID parameter tells calendar app the local time)
  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//dalat.app//Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `DTSTART;TZID=${DALAT_TIMEZONE}:${formatDateForICS(startsAt)}`,
    `DTEND;TZID=${DALAT_TIMEZONE}:${formatDateForICS(endTime)}`,
    `DTSTAMP:${nowFormatted}Z`,
    `UID:${new Date(startsAt).getTime()}@dalat.app`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${(description || "").replace(/\n/g, "\\n")}${mapLine}\\n\\nEvent page: ${url}`,
    `LOCATION:${place.text}`,
    ...(place.geo ? [`GEO:${place.geo}`] : []),
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return icsContent;
}

function downloadICS(props: AddToCalendarProps) {
  const icsContent = generateICSContent(props);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${props.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
        <DropdownMenuItem onClick={() => downloadICS(props)}>
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
