import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

// Force fresh role check on every request (security: prevent stale role caching)
export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";
import { hasRoleLevel } from "@/lib/types";
import { SiteHeader } from "@/components/site-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

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
    "superadmin",
    "admin",
    "moderator",
    "contributor",
  ];
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/");
  }

  // superadmin has all admin permissions
  const isAdmin = profile.role === "admin" || profile.role === "superadmin";
  const isModerator = hasRoleLevel(profile.role, "moderator");

  const t = await getTranslations("admin");

  // Build nav items based on role (using icon names for serialization)
  const navItems = [
    { href: "/admin", label: t("navDashboard"), icon: "LayoutDashboard", show: true },
    {
      href: "/admin/organizers",
      label: t("navOrganizers"),
      icon: "Building2",
      show: isModerator,
    },
    {
      href: "/admin/festivals",
      label: t("navFestivals"),
      icon: "PartyPopper",
      show: isAdmin,
    },
    {
      href: "/admin/verifications",
      label: t("navVerifications"),
      icon: "ShieldCheck",
      show: isAdmin,
    },
    {
      href: "/admin/users",
      label: t("navUsers"),
      icon: "Users",
      show: isAdmin,
    },
    {
      href: "/admin/import",
      label: "Import",
      icon: "Download",
      show: isModerator,
    },
    {
      href: "/admin/personas",
      label: "AI Personas",
      icon: "Sparkles",
      show: isAdmin,
    },
    {
      href: "/admin/blog",
      label: t("navBlog"),
      icon: "FileText",
      show: isAdmin,
    },
  ].filter((item) => item.show);

  // Determine role label
  const roleLabel =
    profile.role === "superadmin"
      ? "Super Admin"
      : profile.role === "admin"
        ? t("roleAdmin")
        : profile.role === "moderator"
          ? t("roleModerator")
          : t("roleContributor");

  return (
    <div className="min-h-screen flex flex-col">
      {/* Regular site header with profile access */}
      <Suspense>
        <SiteHeader />
      </Suspense>

      {/* Admin content with sidebar */}
      <div className="flex-1 flex">
        <AdminSidebar
          navItems={navItems}
          role={profile.role}
          roleLabel={roleLabel}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
