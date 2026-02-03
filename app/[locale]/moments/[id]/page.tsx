import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { generateMomentMetadata } from "@/lib/metadata";
import type { Locale } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string; locale: string }>;
}

/**
 * Legacy moment URL handler - redirects to clean URL format.
 *
 * Old format: /moments/[uuid]
 * New format: /events/[slug]/moments/[uuid]
 *
 * This page fetches the moment's event slug and redirects to the
 * SEO-friendly clean URL structure.
 */
async function getMomentWithEvent(id: string) {
  const supabase = await createClient();

  // Use explicit FK hint to disambiguate from events.cover_moment_id relationship
  const { data, error } = await supabase
    .from("moments")
    .select("id, events!moments_event_id_fkey(slug)")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (error || !data) return null;
  return data;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, locale } = await params;
  const supabase = await createClient();

  // Use explicit FK hint to disambiguate from events.cover_moment_id relationship
  const { data: moment } = await supabase
    .from("moments")
    .select("*, profiles(*), events!moments_event_id_fkey(*)")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (!moment) {
    return { title: "Moment not found" };
  }

  return generateMomentMetadata(moment, locale as Locale);
}

export default async function LegacyMomentPage({ params }: PageProps) {
  const { id, locale } = await params;

  const moment = await getMomentWithEvent(id);

  if (!moment) {
    notFound();
  }

  // Redirect to clean URL format
  // events is a single object when using foreign key join
  const events = moment.events as unknown as { slug: string };
  redirect(`/${locale}/events/${events.slug}/moments/${id}`);
}
