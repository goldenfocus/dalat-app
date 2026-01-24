import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ProUploadPage } from "@/components/moments/pro-upload";
import { getEffectiveUser } from "@/lib/god-mode";
import type { Event } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("title")
    .eq("slug", slug)
    .single();

  const t = await getTranslations("moments.proUpload");

  if (!event) {
    return { title: t("title") };
  }

  return {
    title: `${t("title")} - ${event.title} | ĐàLạt.app`,
  };
}

async function getEvent(slug: string): Promise<Event | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .single();

  return data as Event | null;
}

async function isEventPhotographer(eventId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();

  // For now, only event creator can use pro upload
  // This can be extended to check an event_photographers table
  const { data: event } = await supabase
    .from("events")
    .select("created_by")
    .eq("id", eventId)
    .single();

  return event?.created_by === userId;
}

export default async function ProUploadPageRoute({ params }: PageProps) {
  const { slug } = await params;
  const event = await getEvent(slug);

  if (!event) {
    notFound();
  }

  // Use getEffectiveUser to support God Mode impersonation
  const { user, profile: _profile, godMode } = await getEffectiveUser();

  // Redirect to login if not authenticated
  if (!user) {
    redirect(`/login?redirect=/events/${slug}/moments/pro-upload`);
  }

  // Use real admin for permission check, but effective user for attribution
  const canUseProUpload = await isEventPhotographer(event.id, user.id);

  // Redirect if user is not photographer
  if (!canUseProUpload) {
    redirect(`/events/${slug}/moments/new`);
  }

  // Use the effective user ID (impersonated user if God Mode active)
  const effectiveUserId = godMode.isActive && godMode.targetUserId
    ? godMode.targetUserId
    : user.id;

  return (
    <ProUploadPage
      eventId={event.id}
      eventSlug={slug}
      eventTitle={event.title}
      userId={effectiveUserId}
    />
  );
}
