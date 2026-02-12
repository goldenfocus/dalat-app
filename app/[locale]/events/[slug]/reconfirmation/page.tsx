import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { ReconfirmationDashboard } from "@/components/events/reconfirmation-dashboard";
import { hasRoleLevel, type UserRole } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ReconfirmationPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const t = await getTranslations("reconfirmation");

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

  // Check if user is the creator or admin
  const isCreator = event.created_by === user.id;
  let isAdmin = false;
  if (!isCreator) {
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    isAdmin = roleData ? hasRoleLevel(roleData.role as UserRole, "admin") : false;
  }

  if (!isCreator && !isAdmin) {
    redirect(`/events/${slug}`);
  }

  // Call the RPC to get reconfirmation status
  const { data: status, error: rpcError } = await supabase.rpc(
    "get_reconfirmation_status",
    { p_event_id: event.id }
  );

  if (rpcError || !status?.ok) {
    notFound();
  }

  return (
    <main className="min-h-screen">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href={`/events/${slug}`}
          className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t("backToEvent")}</span>
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <ClipboardCheck className="w-6 h-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8">{event.title}</p>

        {/* Dashboard */}
        <ReconfirmationDashboard
          eventId={event.id}
          eventSlug={event.slug}
          totalGoing={status.total_going}
          confirmed={status.confirmed}
          pending={status.pending}
          cancelled={status.cancelled}
          confirmedAttendees={status.confirmed_attendees}
          pendingAttendees={status.pending_attendees}
          lastRePingAt={status.last_re_ping_at}
        />
      </div>
    </main>
  );
}
