import { redirect } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FestivalForm } from "@/components/admin/festival-form";
import { hasRoleLevel, type UserRole } from "@/lib/types";

async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data;
}

async function getMyOrganizers(userId: string) {
  const supabase = await createClient();

  // Get organizers where user is owner OR user is admin (can see all)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role && hasRoleLevel(profile.role as UserRole, "admin")) {
    // Admin sees all organizers
    const { data } = await supabase
      .from("organizers")
      .select("*")
      .order("name");
    return data ?? [];
  }

  // Verified organizers see only their own
  const { data } = await supabase
    .from("organizers")
    .select("*")
    .eq("owner_id", userId)
    .order("name");

  return data ?? [];
}

export default async function NewFestivalPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await getProfile(user.id);

  // Only admins can access festivals in admin panel (organizers use /organizer portal)
  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    redirect("/");
  }

  const organizers = await getMyOrganizers(user.id);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link
            href="/admin/festivals"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold">Create Festival</h1>
        </div>
        <p className="text-muted-foreground">
          Set up a new festival hub with official events and updates
        </p>
      </div>

      {/* Festival Form */}
      <FestivalForm userId={user.id} organizers={organizers} />
    </div>
  );
}
