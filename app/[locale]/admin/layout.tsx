import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";

// Force fresh role check on every request (security: prevent stale role caching)
export const dynamic = "force-dynamic";
import {
  Shield,
  Building2,
  Home,
  PartyPopper,
  ShieldCheck,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";
import { hasRoleLevel } from "@/lib/types";

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
    console.error("Exception fetching profile in admin layout:", e);
    return null;
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = null;
  let profile: Profile | null = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    console.error("Exception getting user in admin layout:", e);
    redirect("/auth/login");
  }

  if (!user) {
    redirect("/auth/login");
  }

  profile = await getProfile(user.id);

  // Roles that can access admin section (organizers use /organizer portal instead)
  const allowedRoles: UserRole[] = [
    "admin",
    "moderator",
    "contributor",
  ];
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/");
  }

  const isAdmin = profile.role === "admin";
  const isModerator = hasRoleLevel(profile.role, "moderator");

  const t = await getTranslations("admin");

  // Build nav items based on role
  const navItems = [
    { href: "/admin", label: t("navDashboard"), icon: Shield, show: true },
    {
      href: "/admin/organizers",
      label: t("navOrganizers"),
      icon: Building2,
      show: isModerator,
    },
    {
      href: "/admin/festivals",
      label: t("navFestivals"),
      icon: PartyPopper,
      show: isAdmin, // Only admins see festivals in admin panel
    },
    {
      href: "/admin/verifications",
      label: t("navVerifications"),
      icon: ShieldCheck,
      show: isAdmin,
    },
    {
      href: "/admin/users",
      label: t("navUsers"),
      icon: Users,
      show: isAdmin,
    },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Admin Header */}
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
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-sm font-medium">
              <Shield className="w-3 h-3" />
              {profile.role === "admin"
                ? t("roleAdmin")
                : profile.role === "moderator"
                ? t("roleModerator")
                : t("roleContributor")}
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

      {/* Main Content */}
      <main className="flex-1 container max-w-6xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
