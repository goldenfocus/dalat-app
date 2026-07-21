"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Ban, Check, Clock, UserPlus, Lock } from "lucide-react";
import type { Tribe, TribeRequest } from "@/lib/types";

interface JoinTribeButtonProps {
  tribe: Tribe;
  pendingRequest: TribeRequest | null;
  isAuthenticated: boolean;
}

export function JoinTribeButton({ tribe, pendingRequest, isAuthenticated }: JoinTribeButtonProps) {
  const router = useRouter();
  const t = useTranslations("tribes");
  // Deliberately NOT useTransition for the submit state. router.refresh()
  // inside a transition keeps isPending true until the whole tribe page
  // re-renders on the server (auth + tribe + membership + request + events),
  // so the button sat on "Joining..." long after the POST had succeeded.
  // We settle the button on the fetch response and let the refresh land after.
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<"joined" | "requested" | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  // If user is banned
  if ((tribe as Tribe & { user_status?: string }).user_status === "banned") {
    return (
      <div className="flex items-center gap-2 p-4 bg-destructive/10 rounded-lg text-destructive">
        <Ban className="w-5 h-5" />
        <span>{t("banned")}</span>
      </div>
    );
  }

  // If user has a pending request
  if (pendingRequest) {
    return (
      <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-5 h-5" />
          <span>{t("pendingRequest")}</span>
        </div>
        <CancelRequestButton requestId={pendingRequest.id} />
      </div>
    );
  }

  // Handle join action
  async function handleJoin(inviteCode?: string) {
    if (!isAuthenticated) {
      router.push(`/auth/login?redirect=/tribes/${tribe.slug}`);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/tribes/${tribe.slug}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: inviteCode, message: message.trim() || null }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("joinFailed"));
        return;
      }

      setShowRequestModal(false);
      // Confirm to the user right now, then reconcile with the server in the
      // background. The refresh swaps this component out for the real
      // member-facing UI whenever it finishes.
      setOutcome(data.status === "requested" ? "requested" : "joined");
      router.refresh();
    } catch {
      setError(t("joinFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  // Optimistic confirmation shown between a successful POST and the RSC
  // refresh landing.
  if (outcome === "joined") {
    return (
      <div className="flex items-center gap-2 p-4 bg-primary/10 rounded-lg text-primary">
        <Check className="w-5 h-5" />
        <span>{t("joinSuccess")}</span>
      </div>
    );
  }

  if (outcome === "requested") {
    return (
      <div className="flex items-center gap-2 p-4 bg-muted rounded-lg text-muted-foreground">
        <Clock className="w-5 h-5" />
        <span>{t("pendingRequest")}</span>
      </div>
    );
  }

  // For invite-only or secret tribes without a code
  if ((tribe.access_type === "invite_only" || tribe.access_type === "secret") && !tribe.invite_code) {
    return (
      <div className="flex items-center gap-2 p-4 bg-muted rounded-lg text-muted-foreground">
        <Lock className="w-5 h-5" />
        <span>{t("inviteOnlyDesc")}</span>
      </div>
    );
  }

  // For request-to-join tribes
  if (tribe.access_type === "request") {
    return (
      <>
        <Button
          onClick={() => setShowRequestModal(true)}
          className="w-full px-4 py-3"
          disabled={submitting}
        >
          <UserPlus className="w-4 h-4 mr-2" />
          {t("requestToJoin")}
        </Button>

        <Dialog open={showRequestModal} onOpenChange={setShowRequestModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("requestToJoin")}</DialogTitle>
              <DialogDescription>{t("requestMessageDesc")}</DialogDescription>
            </DialogHeader>
            <Textarea
              placeholder={t("requestMessagePlaceholder")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRequestModal(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={() => handleJoin()} disabled={submitting}>
                {submitting ? t("sending") : t("sendRequest")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // For public tribes
  return (
    <div className="space-y-2">
      <Button
        onClick={() => handleJoin()}
        className="w-full px-4 py-3"
        disabled={submitting}
      >
        <UserPlus className="w-4 h-4 mr-2" />
        {submitting ? t("joining") : t("joinTribe")}
      </Button>
      {/* Without this the error was set but never rendered on the public path
          (the only <p> for it lives inside the request modal), so a failed
          join just bounced the button back to "Join tribe" and said nothing. */}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function CancelRequestButton({ requestId }: { requestId: string }) {
  const t = useTranslations("tribes");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleCancel() {
    startTransition(async () => {
      await fetch(`/api/tribes/me/requests/${requestId}`, { method: "DELETE" });
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCancel}
      disabled={isPending}
      className="text-muted-foreground hover:text-destructive px-3 py-2"
    >
      {isPending ? t("cancelling") : t("cancelRequest")}
    </Button>
  );
}
