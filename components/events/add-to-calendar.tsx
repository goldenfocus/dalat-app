"use client";

import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AddToCalendarProps {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt?: string | null;
  url: string;
}

function formatDateForGoogle(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function formatDateForICS(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function generateGoogleCalendarUrl({
  title,
  description,
  location,
  startsAt,
  endsAt,
  url,
}: AddToCalendarProps): string {
  const start = new Date(startsAt);
  // Default to 2 hours if no end time
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatDateForGoogle(start)}/${formatDateForGoogle(end)}`,
    details: `${description || ""}\n\nEvent page: ${url}`.trim(),
    location: location || "",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateICSContent({
  title,
  description,
  location,
  startsAt,
  endsAt,
  url,
}: AddToCalendarProps): string {
  const start = new Date(startsAt);
  // Default to 2 hours if no end time
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const now = new Date();

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//dalat.app//Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `DTSTART:${formatDateForICS(start)}`,
    `DTEND:${formatDateForICS(end)}`,
    `DTSTAMP:${formatDateForICS(now)}`,
    `UID:${start.getTime()}@dalat.app`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${(description || "").replace(/\n/g, "\\n")}\\n\\nEvent page: ${url}`,
    `LOCATION:${location || ""}`,
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
