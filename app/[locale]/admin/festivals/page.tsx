import { Link } from "@/lib/i18n/routing";
import Image from "next/image";
import { ArrowLeft, Plus, Calendar, MapPin, BadgeCheck, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Festival } from "@/lib/types";

async function getMyFestivals(userId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("festivals")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  return (data ?? []) as Festival[];
}

async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data;
}

export default async function AdminFestivalsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await getProfile(user.id);

  // Only admins/superadmins can access festivals in admin panel (organizers use /organizer portal)
  if (!profile || (profile.role !== "admin" && profile.role !== "superadmin")) {
    redirect("/");
  }

  const festivals = await getMyFestivals(user.id);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/admin"
              className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-bold">My Festivals</h1>
          </div>
          <p className="text-muted-foreground">
            Manage your festivals and official events
          </p>
        </div>
        <Link
          href="/admin/festivals/new"
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
        >
          <Plus className="h-4 w-4" />
          New Festival
        </Link>
      </div>

      {/* Festival List */}
      {festivals.length > 0 ? (
        <div className="grid gap-4">
          {festivals.map((festival) => (
            <FestivalRow key={festival.id} festival={festival} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 border rounded-lg bg-card">
          <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-xl font-semibold mb-2">No Festivals Yet</h3>
          <p className="text-muted-foreground mb-6">
            Create your first festival to get started
          </p>
          <Link
            href="/admin/festivals/new"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            <Plus className="h-5 w-5" />
            Create Festival
          </Link>
        </div>
      )}
    </div>
  );
}

function FestivalRow({ festival }: { festival: Festival }) {
  const startDate = new Date(festival.start_date);
  const endDate = new Date(festival.end_date);
  const dateRange = `${startDate.toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "short",
  })} - ${endDate.toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  // Status badge styles
  const statusStyles: Record<string, string> = {
    draft: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    published: "bg-green-500/10 text-green-600 dark:text-green-400",
    cancelled: "bg-red-500/10 text-red-600 dark:text-red-400",
    completed: "bg-muted text-muted-foreground",
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border bg-card">
      {/* Cover Image */}
      <div className="relative h-20 w-32 flex-shrink-0 rounded-lg overflow-hidden">
        {festival.cover_image_url ? (
          <Image
            src={festival.cover_image_url}
            alt={festival.title}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold truncate">{festival.title}</h3>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyles[festival.status]}`}>
            {festival.status}
          </span>
          {festival.is_featured && (
            <BadgeCheck className="h-4 w-4 text-primary" />
          )}
        </div>
        {festival.subtitle && (
          <p className="text-sm text-muted-foreground truncate mb-2">
            {festival.subtitle}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{dateRange}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span>{festival.location_city}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/festivals/${festival.id}/edit`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </Link>
        <Link
          href={`/festivals/${festival.slug}`}
          className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
        >
          View
        </Link>
      </div>
    </div>
  );
}
