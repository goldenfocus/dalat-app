import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type UserRole } from "@/lib/types";
import { generateEventRecap, type EventRecapInput } from "@/lib/blog/event-recap-generator";
import { triggerTranslation } from "@/lib/translations-client";

/**
 * POST /api/blog/generate-recap
 *
 * Generates a blog-style recap from an event's moments.
 * Requires admin/moderator role.
 *
 * Body: { eventId: string }
 *
 * This is the core of the content-to-content SEO pipeline:
 * Event moments → AI descriptions → Blog post → 12 language translations → SEO traffic
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !hasRoleLevel(profile.role as UserRole, "moderator")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { eventId } = body as { eventId: string };

  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  // Fetch event details
  const { data: event } = await supabase
    .from("events")
    .select("id, title, slug, description, location_name, starts_at, ends_at, ai_tags, image_url, organizers(name), venues(name)")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Fetch moments with AI metadata
  const { data: moments } = await supabase
    .from("moments")
    .select("content_type, moment_metadata(*)")
    .eq("event_id", eventId)
    .eq("status", "published")
    .in("content_type", ["photo", "video", "audio", "image"])
    .limit(50);

  if (!moments || moments.length < 3) {
    return NextResponse.json(
      { error: "Need at least 3 moments to generate a recap" },
      { status: 400 }
    );
  }

  const photoCount = moments.filter((m) => m.content_type === "photo" || m.content_type === "image").length;
  const videoCount = moments.filter((m) => m.content_type === "video").length;

  // Build input for recap generator
  const recapInput: EventRecapInput = {
    event: {
      title: event.title,
      description: event.description,
      location_name: event.location_name,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      ai_tags: event.ai_tags,
    },
    moments: moments.map((m) => {
      const meta = m.moment_metadata as unknown as Record<string, unknown> | null;
      return {
        content_type: m.content_type,
        ai_description: (meta?.ai_description as string) || null,
        ai_title: (meta?.ai_title as string) || null,
        scene_description: (meta?.scene_description as string) || null,
        mood: (meta?.mood as string) || null,
        detected_objects: (meta?.detected_objects as string[]) || null,
        detected_text: (meta?.detected_text as string[]) || null,
        ai_tags: (meta?.ai_tags as string[]) || null,
        video_summary: (meta?.video_summary as string) || null,
        audio_summary: (meta?.audio_summary as string) || null,
      };
    }),
    venueName: (event.venues as unknown as { name: string } | null)?.name || null,
    organizerName: (event.organizers as unknown as { name: string } | null)?.name || null,
    momentCount: moments.length,
    photoCount,
    videoCount,
  };

  // Generate the recap
  const recap = await generateEventRecap(recapInput);

  // Get the blog category for "stories"
  const { data: category } = await supabase
    .from("blog_categories")
    .select("id")
    .eq("slug", "stories")
    .single();

  // Create a blog post draft from the recap
  const { data: blogPost, error: blogError } = await supabase
    .from("blog_posts")
    .insert({
      title: `${event.title} — Event Recap`,
      slug: recap.suggested_slug,
      story_content: recap.story_content,
      technical_content: recap.technical_content,
      meta_description: recap.meta_description,
      seo_keywords: recap.seo_keywords,
      social_share_text: recap.social_share_text,
      suggested_cta_url: `/events/${event.slug}/moments`,
      suggested_cta_text: recap.suggested_cta_text,
      cover_image_url: event.image_url,
      source: "manual",
      status: "draft",
      category_id: category?.id || null,
      author_id: user.id,
    })
    .select("id, slug")
    .single();

  if (blogError) {
    return NextResponse.json({ error: blogError.message }, { status: 500 });
  }

  // Trigger translations for the blog post (12 languages)
  if (blogPost) {
    triggerTranslation("blog", blogPost.id, [
      { field_name: "title", text: `${event.title} — Event Recap` },
      { field_name: "story_content", text: recap.story_content },
      { field_name: "technical_content", text: recap.technical_content },
      { field_name: "meta_description", text: recap.meta_description },
    ]);
  }

  return NextResponse.json({
    success: true,
    blogPost: {
      id: blogPost.id,
      slug: blogPost.slug,
    },
    stats: {
      momentsAnalyzed: moments.length,
      photoCount,
      videoCount,
      keywordsGenerated: recap.seo_keywords.length,
    },
  });
}
