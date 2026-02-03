import { notFound, redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ModerationQueue } from "@/components/moments/moderation-queue";
import type { MomentWithProfile } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ModerationPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const t = await getTranslations("moments.moderation");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch the event
  const { data: event, error } = await supabase
    .from("events")
    .select("id, slug, title, created_by")
    .eq("slug", slug)
    .single();

  if (error || !event) {
    notFound();
  }

  // Check if user is the creator
  if (event.created_by !== user.id) {
    redirect(`/events/${slug}`);
  }

  // Fetch pending moments using RPC
  const { data: pendingMoments } = await supabase.rpc("get_pending_moments", {
    p_event_id: event.id,
    p_limit: 50,
    p_offset: 0,
  });

  return (
    <main className="min-h-screen">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-6 h-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8">{event.title}</p>

        <ModerationQueue
          moments={(pendingMoments ?? []) as (MomentWithProfile & { status: string })[]}
        />
      </div>
    </main>
  );
}
