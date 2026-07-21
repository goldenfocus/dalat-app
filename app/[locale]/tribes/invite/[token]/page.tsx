import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AcceptInvite } from "./accept-invite";
import type { TribeInvitationByToken } from "@/lib/types";

interface PageProps {
  params: Promise<{ token: string; locale: string }>;
}

/**
 * Tribe invitation landing page.
 *
 * A distinct route rather than an overload of `/invite/[token]`, which is
 * event-specific (event card, RSVP buttons, .ics download).
 *
 * The invitation is read through `get_tribe_invitation_by_token` — a
 * SECURITY DEFINER RPC — because `tribes` RLS hides secret tribes from
 * non-members, so an anonymous invitee's plain join would return nothing.
 */
export default async function TribeInvitePage({ params }: PageProps) {
  const { token, locale } = await params;
  const t = await getTranslations({ locale, namespace: "tribes" });
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_tribe_invitation_by_token", {
    p_token: token,
  });

  const invitation = (data as TribeInvitationByToken | null) ?? null;

  if (error || !invitation?.tribe) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t("inviteNotFoundTitle")}</h1>
          <p className="text-muted-foreground">{t("inviteNotFoundDescription")}</p>
        </div>
      </main>
    );
  }

  const { tribe, inviter } = invitation;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAlreadyMember = false;
  if (user) {
    const { data: membership } = await supabase
      .from("tribe_members")
      .select("id")
      .eq("tribe_id", tribe.id)
      .eq("user_id", user.id)
      .maybeSingle();
    isAlreadyMember = !!membership;
  }

  // The read receipt (status -> 'viewed') is set inside the RPC above: an
  // anonymous invitee cannot pass the UPDATE policy, so doing it here would
  // silently no-op.

  const inviterName = inviter?.display_name || inviter?.username || "";

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {tribe.cover_image_url && (
          <div className="relative h-32 overflow-hidden rounded-t-lg">
            <Image src={tribe.cover_image_url} alt={tribe.name} fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
          </div>
        )}

        <CardHeader className="text-center">
          <div className="relative mx-auto w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary mb-2 overflow-hidden">
            {tribe.settings?.avatar_url ? (
              <Image
                src={tribe.settings.avatar_url}
                alt={tribe.name}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              tribe.name.charAt(0).toUpperCase()
            )}
          </div>
          <CardTitle>
            {t("inviteHeading", { inviter: inviterName, name: tribe.name })}
          </CardTitle>
          {tribe.description && <CardDescription>{tribe.description}</CardDescription>}
        </CardHeader>

        <CardContent className="space-y-4">
          {inviter && (inviter.display_name || inviter.username) && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Avatar className="w-6 h-6">
                <AvatarImage src={inviter.avatar_url || undefined} />
                <AvatarFallback>{inviterName.charAt(0) || "?"}</AvatarFallback>
              </Avatar>
              <span>{inviterName}</span>
            </div>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {t("memberCount", { count: tribe.member_count ?? 0 })}
          </p>

          {invitation.personal_note && (
            <p className="text-center text-sm italic whitespace-pre-wrap">
              “{invitation.personal_note}”
            </p>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {t("inviteLandingSubtitle")}
          </p>

          <AcceptInvite
            token={token}
            tribeSlug={tribe.slug}
            isAuthenticated={!!user}
            isAlreadyMember={isAlreadyMember}
            locale={locale}
          />
        </CardContent>
      </Card>
    </main>
  );
}
