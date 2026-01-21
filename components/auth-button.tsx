import { Link } from "@/lib/i18n/routing";
import { getTranslations } from "next-intl/server";
import { Button } from "./ui/button";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notifications/notification-bell";
import { getEffectiveUser } from "@/lib/god-mode";

export async function AuthButton() {
  const t = await getTranslations("nav");

  // Get effective user (respects God Mode impersonation)
  const { user, profile, godMode } = await getEffectiveUser();

  if (!user || !profile) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/auth/login">{t("signIn")}</Link>
      </Button>
    );
  }

  // Use real user ID for notifications, not impersonated user
  const userId = godMode.isActive ? godMode.realAdminId! : user.id;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <NotificationBell userId={userId} />
      <UserMenu
        avatarUrl={profile.avatar_url}
        displayName={profile.display_name}
        username={profile.username}
        role={profile.role}
        isGodMode={godMode.isActive}
      />
    </div>
  );
}
