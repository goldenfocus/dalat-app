"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InviteeInput, type Invitee } from "@/components/shared/invitee-input";
import { TribeShareButton } from "./tribe-share-button";
import type { Tribe } from "@/lib/types";

interface TribeInviteModalProps {
  tribe: Pick<Tribe, "name" | "slug" | "access_type">;
  /** Join code — admins only. See TribeShareButton for why this is gated. */
  inviteCode?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface InviteResult {
  email?: string;
  userId?: string;
  success: boolean;
  error?: string;
}

/**
 * Invite people to a tribe by email or @username.
 *
 * Uses the SHARED `InviteeInput`, not the fork inside events/invite-modal.tsx —
 * that fork exists only to add the `@audience` row type, and tribes have no
 * audience blasts. All copy lives in the `tribes` namespace (core), except
 * InviteeInput's own keys which live in `invite` — registered on the tribes
 * route island for exactly this reason.
 */
export function TribeInviteModal({
  tribe,
  inviteCode,
  open,
  onOpenChange,
}: TribeInviteModalProps) {
  const router = useRouter();
  const t = useTranslations("tribes");
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  // Show the leader how many invites they have left BEFORE they type 40
  // addresses and collect a 429. Tribe invites have their own bucket, so this
  // number is not the event-invite allowance.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tribes/${tribe.slug}/invitations`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.quota?.remaining_daily === "number") {
          setRemaining(data.quota.remaining_daily);
        }
      } catch (err) {
        // Non-fatal: the send path enforces the quota server-side anyway.
        console.error("[tribe invite] quota lookup failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tribe.slug]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setInvitees([]);
      setNote("");
      setError(null);
      setStatus(null);
    }
    onOpenChange(next);
  };

  const handleSend = async () => {
    if (invitees.length === 0) {
      setError(t("inviteNeedsRecipient"));
      return;
    }

    setSending(true);
    setError(null);
    setStatus(null);

    const emails = invitees
      .filter((i): i is Extract<Invitee, { type: "email" }> => i.type === "email")
      .map((i) => i.email);
    const users = invitees
      .filter((i): i is Extract<Invitee, { type: "user" }> => i.type === "user")
      .map((i) => i.user.id);

    try {
      const response = await fetch(`/api/tribes/${tribe.slug}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, users, personalNote: note.trim() || undefined }),
      });

      const data = await response.json();

      if (!response.ok) {
        // A 429 or 403 rendered as a silent no-op is how the old contacts
        // endpoint hid its own failures — always say what happened.
        if (response.status === 429) setError(t("inviteQuotaExceeded"));
        else if (response.status === 403) setError(t("inviteNotAuthorized"));
        else setError(t("inviteFailed"));
        return;
      }

      const results: InviteResult[] = data.results ?? [];
      const failed = results.filter((r) => !r.success);

      // Keep only the ones that failed, so a retry doesn't re-send the rest.
      const failedEmails = new Set(failed.map((r) => r.email).filter(Boolean));
      const failedUserIds = new Set(failed.map((r) => r.userId).filter(Boolean));
      setInvitees(
        invitees.filter((i) =>
          i.type === "email" ? failedEmails.has(i.email) : failedUserIds.has(i.user.id)
        )
      );

      setStatus(t("inviteSent", { count: data.sent ?? 0 }));
      if (typeof data.remaining_daily === "number") setRemaining(data.remaining_daily);
      if (failed.length > 0) setError(t("inviteSomeFailed", { count: failed.length }));
      if ((data.sent ?? 0) > 0) router.refresh();
    } catch {
      setError(t("inviteFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("inviteToTribe")}</DialogTitle>
          <DialogDescription>{t("inviteModalDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <InviteeInput
            invitees={invitees}
            onInviteesChange={setInvitees}
            disabled={sending}
            placeholder={t("inviteePlaceholder")}
          />

          <div className="space-y-2">
            <Label htmlFor="tribe-invite-note" className="text-sm">
              {t("inviteNoteLabel")}
            </Label>
            <Textarea
              id="tribe-invite-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("inviteNotePlaceholder")}
              rows={2}
              disabled={sending}
              // 16px floor: iOS Safari auto-zooms any focused field below it,
              // and the zoom persists across navigation.
              className="text-base"
            />
          </div>

          {/* Site admins get an unlimited sentinel (999999) — showing them a
              "999999 invites left" counter would be noise, not information. */}
          {remaining !== null && remaining < 1000 && (
            <p className="text-xs text-muted-foreground">
              {t("inviteQuotaRemaining", { count: remaining })}
            </p>
          )}

          {status && <p className="text-sm text-green-600">{status}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            onClick={handleSend}
            disabled={sending || invitees.length === 0}
            className="w-full px-4 py-3"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("inviteSending")}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {t("sendInvites")}
              </>
            )}
          </Button>

          <div className="flex items-center justify-between gap-3 pt-2 border-t">
            <span className="text-sm text-muted-foreground">{t("shareInstead")}</span>
            <TribeShareButton tribe={tribe} inviteCode={inviteCode} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
