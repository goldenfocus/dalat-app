import { Link } from "@/lib/i18n/routing";
import { getTranslations } from "next-intl/server";
import { Button } from "./ui/button";
import { UserMenu } from "./user-menu";
import { NotificationInbox } from "./notification-inbox";
import { generateSubscriberHash } from "@/lib/novu";
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

  // Generate HMAC hash for secure Novu authentication
  // Use real user ID for notifications, not impersonated user
  const subscriberHash = generateSubscriberHash(godMode.isActive ? godMode.realAdminId! : user.id);

  return (
    <div className="flex items-center gap-2 shrink-0">
      <NotificationInbox
        subscriberId={godMode.isActive ? godMode.realAdminId! : user.id}
        subscriberHash={subscriberHash}
      />
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
