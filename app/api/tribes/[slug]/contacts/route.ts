import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// GET /api/tribes/[slug]/contacts - List contacts
export async function GET(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  // Get contacts
  const { data: contacts, error } = await supabase
    .from("tribe_contacts")
    .select("*")
    .eq("tribe_id", tribe.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contacts });
}

// POST /api/tribes/[slug]/contacts - Add contacts (bulk)
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
  const { contacts } = body as {
    contacts: Array<{
      email: string;
      name?: string;
      phone?: string;
      notes?: string;
    }>;
  };

  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json(
      { error: "contacts array required" },
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

  // Insert contacts (upsert to handle duplicates)
  const contactsToInsert = contacts.map((c) => ({
    tribe_id: tribe.id,
    email: c.email.toLowerCase().trim(),
    name: c.name?.trim() || null,
    phone: c.phone?.trim() || null,
    notes: c.notes?.trim() || null,
    status: "active",
  }));

  const { data: inserted, error } = await supabase
    .from("tribe_contacts")
    .upsert(contactsToInsert, {
      onConflict: "tribe_id,email",
      ignoreDuplicates: false,
    })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    inserted: inserted?.length || 0,
    total: contacts.length,
  });
}

// DELETE /api/tribes/[slug]/contacts?id=xxx - Delete a contact
export async function DELETE(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { slug } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("id");

  if (!contactId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
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

  // Delete contact (verify it belongs to this tribe)
  const { error } = await supabase
    .from("tribe_contacts")
    .delete()
    .eq("id", contactId)
    .eq("tribe_id", tribe.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
