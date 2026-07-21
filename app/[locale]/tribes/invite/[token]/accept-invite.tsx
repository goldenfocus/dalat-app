"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AcceptInviteProps {
  token: string;
  tribeSlug: string;
  isAuthenticated: boolean;
  isAlreadyMember: boolean;
  locale: string;
}

export function AcceptInvite({
  token,
  tribeSlug,
  isAuthenticated,
  isAlreadyMember,
  locale,
}: AcceptInviteProps) {
  const router = useRouter();
  const t = useTranslations("tribes");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isAlreadyMember) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-center text-muted-foreground">
          {t("inviteAlreadyMemberNote")}
        </p>
        <Button
          onClick={() => router.push(`/${locale}/tribes/${tribeSlug}`)}
          className="w-full px-4 py-3"
        >
          {t("viewTribe")}
        </Button>
      </div>
    );
  }

  const handleAccept = () => {
    if (!isAuthenticated) {
      // Login-then-continue: come back to this exact token, not the tribe page,
      // so the accept still records invited_by.
      router.push(`/${locale}/auth/login?redirect=/tribes/invite/${token}`);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/tribes/invitations/${token}`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
          // The server's `error` is untranslated English — log it for support
          // and show the user a translated message.
          console.error("[tribe invite] accept failed:", data.error);
          setError(t("inviteAcceptFailed"));
          return;
        }
        router.push(`/${locale}/tribes/${data.slug ?? tribeSlug}`);
      } catch {
        setError(t("inviteAcceptFailed"));
      }
    });
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
      <Button onClick={handleAccept} disabled={isPending} className="w-full px-4 py-3">
        {isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Users className="w-4 h-4 mr-2" />
        )}
        {isAuthenticated ? t("joinTribe") : t("inviteSignInFirst")}
      </Button>
    </div>
  );
}
