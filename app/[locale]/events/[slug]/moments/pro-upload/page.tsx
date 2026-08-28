import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCanonicalEventSlug } from "@/lib/events/slug-resolution";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

/**
 * Pro upload has been merged into the unified upload experience.
 * Redirect to the regular upload page which now supports all features.
 */
export default async function ProUploadRedirect({ params }: PageProps) {
  const { slug, locale } = await params;
  const supabase = await createClient();
  const canonicalSlug = await resolveCanonicalEventSlug(supabase, slug);
  if (!canonicalSlug) {
    notFound();
  }
  redirect(`/${locale}/events/${canonicalSlug}/moments/new`);
}
