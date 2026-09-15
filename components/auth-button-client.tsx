"use client";

import dynamic from "next/dynamic";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { Button } from "./ui/button";
import { UserMenu } from "./user-menu";
import { useViewer } from "@/lib/hooks/use-viewer";

const NotificationBell = dynamic(
  () => import("./notifications/notification-bell").then((mod) => mod.NotificationBell),
  { ssr: false },
);

export function AuthButtonClient() {
  const t = useTranslations("nav");
  const { profile, isGodMode, isLoading } = useViewer();

  if (isLoading) return <div className="w-8 h-8" role="status" aria-label="Loading" />;
  if (!profile) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/auth/login">{t("signIn")}</Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <NotificationBell key={`notifications-${profile.id}`} userId={profile.id} />
      <UserMenu
        key={`menu-${profile.id}`}
        avatarUrl={profile.avatar_url}
        displayName={profile.display_name}
        username={profile.username}
        role={profile.role}
        isGodMode={isGodMode}
      />
    </div>
  );
}
