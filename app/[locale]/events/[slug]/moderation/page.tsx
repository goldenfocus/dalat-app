import { notFound, redirect } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import { ArrowLeft, Shield } from "lucide-react";
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
  const tCommon = await getTranslations("common");

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
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-2xl items-center mx-auto px-4">
          <Link
            href={`/events/${slug}/settings`}
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tCommon("back")}</span>
          </Link>
        </div>
      </nav>

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
