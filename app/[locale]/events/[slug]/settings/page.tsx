import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCanonicalEventSlug } from "@/lib/events/slug-resolution";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

// Redirect old settings URL to the consolidated edit page
export default async function EventSettingsPage({ params }: PageProps) {
  const { slug, locale } = await params;
  const supabase = await createClient();
  const canonicalSlug = await resolveCanonicalEventSlug(supabase, slug);

  if (!canonicalSlug) {
    notFound();
  }

  redirect(`/${locale}/events/${canonicalSlug}/edit`);
}
