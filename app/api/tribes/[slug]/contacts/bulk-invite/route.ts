import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendBulkEventInvites } from "@/lib/resend";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// POST /api/tribes/[slug]/contacts/bulk-invite - Send event invites to contacts
export async function POST(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { event_id, contact_ids } = body as {
    event_id: string;
    contact_ids: string[];
  };

  if (!event_id) {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }

  if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
    return NextResponse.json(
      { error: "contact_ids array required" },
      { status: 400 }
    );
  }

  // Get tribe and verify user is admin/leader
  const { data: tribe } = await supabase
    .from("tribes")
    .select("id, created_by")
    .eq("slug", slug)
    .single();

  if (!tribe) {
    return NextResponse.json({ error: "Tribe not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("tribe_members")
    .select("role")
    .eq("tribe_id", tribe.id)
    .eq("user_id", user.id)
    .single();

  const isAdmin =
    tribe.created_by === user.id ||
    membership?.role === "leader" ||
    membership?.role === "admin";

  if (!isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Get event details
  const { data: event } = await supabase
    .from("events")
    .select("id, title, start_time, location_name, location_address, description")
    .eq("id", event_id)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Get contacts that haven't been invited to this event yet
  const { data: contacts } = await supabase
    .from("tribe_contacts")
    .select("id, email, name")
    .eq("tribe_id", tribe.id)
    .eq("status", "active")
    .in("id", contact_ids);

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ error: "No valid contacts found" }, { status: 400 });
  }

  // Check which contacts have already been invited
  const { data: existingInvites } = await supabase
    .from("contact_invites")
    .select("contact_id")
    .eq("event_id", event_id)
    .in("contact_id", contact_ids);

  const alreadyInvitedIds = new Set(existingInvites?.map((i) => i.contact_id) || []);
  const contactsToInvite = contacts.filter((c) => !alreadyInvitedIds.has(c.id));

  if (contactsToInvite.length === 0) {
    return NextResponse.json({
      success: true,
      sent: 0,
      skipped: contacts.length,
      message: "All contacts have already been invited",
    });
  }

  // Create invite records first to get tokens
  const inviteRecords = contactsToInvite.map((contact) => ({
    contact_id: contact.id,
    event_id: event_id,
    status: "sent",
  }));

  const { data: insertedInvites, error: insertError } = await supabase
    .from("contact_invites")
    .insert(inviteRecords)
    .select("id, contact_id, invite_token");

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Build contact data with tokens
  const contactsWithTokens = contactsToInvite.map((contact) => {
    const invite = insertedInvites?.find((i) => i.contact_id === contact.id);
    return {
      email: contact.email,
      name: contact.name || undefined,
      token: invite?.invite_token || "",
    };
  });

  // Get base URL from request
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  // Send emails via Resend
  const result = await sendBulkEventInvites(
    contactsWithTokens,
    {
      id: event.id,
      title: event.title,
      date: new Date(event.start_time),
      location: event.location_name || event.location_address || "TBA",
      description: event.description || undefined,
    },
    baseUrl
  );

  // Update invite status for failed sends
  if (result.failed > 0) {
    // Mark some as bounced if there were failures
    // In a production app, you'd want to track which specific emails failed
    console.error("Some invites failed to send:", result.errors);
  }

  return NextResponse.json({
    success: result.success,
    sent: result.sent,
    failed: result.failed,
    skipped: contacts.length - contactsToInvite.length,
    errors: result.errors,
  });
}
