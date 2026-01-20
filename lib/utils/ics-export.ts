import type { Event } from '@/lib/types';
import { format } from 'date-fns';

/**
 * Format a date to ICS format (YYYYMMDDTHHMMSSZ)
 */
function formatICS(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Convert to UTC and format as YYYYMMDDTHHMMSSZ
  return format(d, "yyyyMMdd'T'HHmmss'Z'");
}

/**
 * Escape special characters in ICS text fields
 */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Generate ICS calendar file content for an event
 */
export function generateICS(event: Event): string {
  const startDate = formatICS(event.starts_at);
  const endDate = event.ends_at
    ? formatICS(event.ends_at)
    : formatICS(new Date(new Date(event.starts_at).getTime() + 4 * 60 * 60 * 1000)); // Default 4 hours

  const now = formatICS(new Date());

  // Build description with event details
  let description = escapeICS(event.description || '');

  // Add event link to description
  const eventUrl = `https://dalat.app/events/${event.slug}`;
  description += `\\n\\nView event: ${eventUrl}`;

  // Build location string
  const location = event.location_name ? escapeICS(event.location_name) : '';

  // Optional: Add geo coordinates if available
  let geoLine = '';
  if (event.latitude && event.longitude) {
    geoLine = `GEO:${event.latitude};${event.longitude}\r\n`;
  }

  // Generate unique UID
  const uid = `${event.id}@dalat.app`;

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//dalat.app//Events//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:${escapeICS(event.title)}
DESCRIPTION:${description}
LOCATION:${location}
${geoLine}URL:${eventUrl}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`.replace(/\n/g, '\r\n'); // ICS requires CRLF line endings
}

/**
 * Trigger download of ICS file for an event
 */
export function downloadICS(event: Event): void {
  const ics = generateICS(event);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.slug}.ics`;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate ICS content for multiple events (calendar subscription)
 */
export function generateMultiEventICS(events: Event[]): string {
  const now = formatICS(new Date());

  let vcalendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//dalat.app//Events//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Da Lat Events
X-WR-TIMEZONE:Asia/Ho_Chi_Minh
X-WR-CALDESC:Upcoming events in Da Lat
`;

  // Add each event as a VEVENT
  events.forEach(event => {
    const startDate = formatICS(event.starts_at);
    const endDate = event.ends_at
      ? formatICS(event.ends_at)
      : formatICS(new Date(new Date(event.starts_at).getTime() + 4 * 60 * 60 * 1000));

    let description = escapeICS(event.description || '');
    const eventUrl = `https://dalat.app/events/${event.slug}`;
    description += `\\n\\nView event: ${eventUrl}`;

    const location = event.location_name ? escapeICS(event.location_name) : '';
    const uid = `${event.id}@dalat.app`;

    let geoLine = '';
    if (event.latitude && event.longitude) {
      geoLine = `GEO:${event.latitude};${event.longitude}\r\n`;
    }

    vcalendar += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:${escapeICS(event.title)}
DESCRIPTION:${description}
LOCATION:${location}
${geoLine}URL:${eventUrl}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
`;
  });

  vcalendar += `END:VCALENDAR`;

  return vcalendar.replace(/\n/g, '\r\n');
}

/**
 * Download multiple events as a single ICS file
 */
export function downloadMultiEventICS(events: Event[], filename: string = 'dalat-events'): void {
  const ics = generateMultiEventICS(events);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.ics`;

  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
