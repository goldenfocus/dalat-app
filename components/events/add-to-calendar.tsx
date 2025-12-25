"use client";

import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatInDaLat, DALAT_TIMEZONE } from "@/lib/timezone";

interface AddToCalendarProps {
  title: string;
  description?: string | null;
  locationName?: string | null;
  address?: string | null;
  googleMapsUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  url: string;
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
  startsAt,
  endsAt,
  url,
}: AddToCalendarProps): string {
  // Default to 2 hours if no end time
  const endTime = endsAt || addTwoHours(startsAt);

  // Use full address if available (best for Google Calendar search)
  // Otherwise use location name with Da Lat suffix
  let location = "";
  if (address) {
    location = address;
  } else if (locationName) {
    location = `${locationName}, Da Lat, Vietnam`;
  }

  // Build description with optional maps link
  let details = description || "";
  if (googleMapsUrl) {
    details += `\n\nLocation: ${googleMapsUrl}`;
  }
  details += `\n\nEvent page: ${url}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatDateForGoogle(startsAt)}/${formatDateForGoogle(endTime)}`,
    details: details.trim(),
    location,
    ctz: DALAT_TIMEZONE, // Display in Da Lat timezone
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateICSContent({
  title,
  description,
  locationName,
  address,
  googleMapsUrl,
  startsAt,
  endsAt,
  url,
}: AddToCalendarProps): string {
  // Default to 2 hours if no end time
  const endTime = endsAt || addTwoHours(startsAt);
  const nowFormatted = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  // For ICS, prefer address, then location name with maps URL
  let location = "";
  if (address) {
    location = address;
  } else if (locationName) {
    location = googleMapsUrl
      ? `${locationName} - ${googleMapsUrl}`
      : locationName;
  } else if (googleMapsUrl) {
    location = googleMapsUrl;
  }

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
    `DESCRIPTION:${(description || "").replace(/\n/g, "\\n")}\\n\\nEvent page: ${url}`,
    `LOCATION:${location}`,
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

export function AddToCalendar(props: AddToCalendarProps) {
  const googleUrl = generateGoogleCalendarUrl(props);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <CalendarPlus className="w-4 h-4 mr-2" />
          Add to calendar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-48">
        <DropdownMenuItem asChild>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer">
            Google Calendar
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadICS(props)}>
          Apple / Outlook (.ics)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
