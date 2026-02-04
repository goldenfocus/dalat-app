import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SeriesForm } from "@/components/series/series-form";
import { hasRoleLevel, type EventSeries, type UserRole } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function EditSeriesPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch the series with related data
  const { data: series, error } = await supabase
    .from("event_series")
    .select("*, organizers:organizer_id(id, name, slug, logo_url)")
    .eq("slug", slug)
    .single();

  if (error || !series) {
    notFound();
  }

  // Check if user is the creator or an admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isCreator = series.created_by === user.id;
  const isAdmin = profile?.role ? hasRoleLevel(profile.role as UserRole, "admin") : false;

  if (!isCreator && !isAdmin) {
    redirect(`/series/${slug}`);
  }

  return (
    <main className="min-h-screen">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <SeriesForm
          series={series as EventSeries}
          userId={user.id}
        />
      </div>
    </main>
  );
}
