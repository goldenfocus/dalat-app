import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_LOCALES } from "@/lib/types";
import { experienceAdmin, safeMutation } from "@/lib/experiences/server";
export async function POST(request: Request) {
  if (!safeMutation(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { count } = await db
    .from("experiences")
    .select("id", { head: true, count: "exact" })
    .eq("author_id", user.id)
    .gte("created_at", new Date(Date.now() - 86400000).toISOString());
  if ((count || 0) >= 20)
    return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
  const input = await request.json().catch(() => ({}));
  const locale = CONTENT_LOCALES.includes(input.locale) ? input.locale : "en";
  let place = {};
  if (input.from) {
    if (!z.string().uuid().safeParse(input.from).success)
      return NextResponse.json(
        { error: "Invalid experience" },
        { status: 400 },
      );
    const { data: source } = await db
      .from("experiences")
      .select("venue_id")
      .eq("id", input.from)
      .eq("status", "published")
      .maybeSingle();
    if (!source)
      return NextResponse.json(
        { error: "Experience not found" },
        { status: 404 },
      );
    if (source.venue_id) {
      const { data: venue } = await db
        .from("venues")
        .select("id,name,address")
        .eq("id", source.venue_id)
        .maybeSingle();
      if (venue)
        place = {
          venue_id: venue.id,
          venue_name: venue.name,
          venue_address: venue.address || "",
          venue_confirmed: false,
        };
    }
  }
  const { data, error } = await db
    .from("experiences")
    .insert({
      ...place,
      author_id: user.id,
      original_language: locale,
      visit_date: new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
      }),
    })
    .select("id")
    .single();
  if (error)
    return NextResponse.json(
      { error: "Draft could not be saved" },
      { status: 503 },
    );
  const { error: sourceError } = await experienceAdmin()
    .from("experience_sources")
    .insert({ experience_id: data.id });
  if (sourceError)
    return NextResponse.json(
      { error: "Draft could not be prepared" },
      { status: 503 },
    );
  return NextResponse.json(data);
}
