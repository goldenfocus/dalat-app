import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Types for the invitation data from the RPC function
type InvitationData = {
  id: string;
  event: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    location_name: string | null;
    address: string | null;
    starts_at: string;
    ends_at: string | null;
    timezone: string;
  };
};

// GET /api/invite/[token]/calendar.ics - Download ICS calendar file
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const supabase = await createClient();
  const { token } = await params;

  // Use SECURITY DEFINER function to bypass events RLS
  // This allows anonymous users to download calendar for private tribe events
  const { data, error } = await supabase.rpc('get_invitation_by_token', {
    p_token: token,
  });

  if (error || !data) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  const invitation = data as InvitationData;
  const event = invitation.event;

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // Generate ICS content
  const icsContent = generateICS(event);

  // Return as downloadable file
  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(event.title)}.ics"`,
    },
  });
}

function generateICS(event: {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  location_name: string | null;
  address: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
}): string {
  const startDate = new Date(event.starts_at);
  const endDate = event.ends_at
    ? new Date(event.ends_at)
    : new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // Default 2 hour duration

  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${event.slug}`;

  // Format dates for ICS (YYYYMMDDTHHMMSSZ)
  const formatICSDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };

  // Escape special characters for ICS
  const escapeICS = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  };

  // Build location string
  const location = [event.location_name, event.address]
    .filter(Boolean)
    .join(', ');

  // Build description with URL
  const description = [
    event.description,
    '',
    `View event: ${eventUrl}`,
  ]
    .filter(line => line !== undefined)
    .join('\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dalat.app//Event Invite//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@dalat.app`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(startDate)}`,
    `DTEND:${formatICSDate(endDate)}`,
    `SUMMARY:${escapeICS(event.title)}`,
  ];

  if (description) {
    lines.push(`DESCRIPTION:${escapeICS(description)}`);
  }

  if (location) {
    lines.push(`LOCATION:${escapeICS(location)}`);
  }

  lines.push(`URL:${eventUrl}`);
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}
