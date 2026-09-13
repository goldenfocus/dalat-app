"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Button } from "./ui/button";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notifications/notification-bell";
import { useViewer } from "@/lib/hooks/use-viewer";

export function AuthButton() {
  const t = useTranslations("nav");
  const { profile, isGodMode } = useViewer();

  // Show sign-in button while loading or when not authenticated
  if (!profile) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/auth/login">{t("signIn")}</Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <NotificationBell key={profile.id} userId={profile.id} />
      <UserMenu
        key={profile.id}
        avatarUrl={profile.avatar_url}
        displayName={profile.display_name}
        username={profile.username}
        role={profile.role}
        isGodMode={isGodMode}
      />
    </div>
  );
}
