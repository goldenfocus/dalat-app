import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import {
  Building2,
  Home,
  PartyPopper,
  Calendar,
  LayoutDashboard,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Organizer } from "@/lib/types";

// Force fresh data on every request
export const dynamic = "force-dynamic";

async function getProfile(userId: string): Promise<Profile | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    return data;
  } catch (e) {
    console.error("Exception fetching profile in organizer layout:", e);
    return null;
  }
}

async function getMyOrganizer(userId: string): Promise<Organizer | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizers")
      .select("*")
      .eq("owner_id", userId)
      .single();
    return data;
  } catch {
    return null;
  }
}

export default async function OrganizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = null;
  let profile: Profile | null = null;
  let organizer: Organizer | null = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    console.error("Exception getting user in organizer layout:", e);
    redirect("/auth/login");
  }

  if (!user) {
    redirect("/auth/login");
  }

  profile = await getProfile(user.id);

  // Only verified organizers can access this portal
  if (!profile || profile.role !== "organizer_verified") {
    redirect("/");
  }

  // Check if user has an associated organizer
  organizer = await getMyOrganizer(user.id);

  const t = await getTranslations("organizerPortal");

  // Build nav items
  const navItems = [
    { href: "/organizer", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/organizer/festivals", label: t("festivals"), icon: PartyPopper },
    { href: "/organizer/events", label: t("events"), icon: Calendar },
      ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Organizer Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 items-center justify-between mx-auto px-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">dalat.app</span>
            </Link>
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium">
              <Building2 className="w-3 h-3" />
              {organizer?.name || t("organizer")}
            </div>
          </div>

          {/* Nav links */}
          <div className="flex items-center gap-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* No organizer warning */}
      {!organizer && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-3">
          <div className="container mx-auto max-w-6xl flex items-center gap-2 text-yellow-700 dark:text-yellow-300 text-sm">
            <Building2 className="w-4 h-4" />
            <span>
              {t("noOrganizerLinked")} — {t("contactAdmin")}
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 container max-w-6xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
