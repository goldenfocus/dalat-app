"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Ban, Clock, UserPlus, Lock } from "lucide-react";
import type { Tribe, TribeRequest } from "@/lib/types";

interface JoinTribeButtonProps {
  tribe: Tribe;
  pendingRequest: TribeRequest | null;
  isAuthenticated: boolean;
}

export function JoinTribeButton({ tribe, pendingRequest, isAuthenticated }: JoinTribeButtonProps) {
  const router = useRouter();
  const t = useTranslations("tribes");
  const [isPending, startTransition] = useTransition();
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

    startTransition(async () => {
      const res = await fetch(`/api/tribes/${tribe.slug}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: inviteCode, message: message.trim() || null }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to join");
        return;
      }

      setShowRequestModal(false);
      router.refresh();
    });
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
          disabled={isPending}
        >
          <UserPlus className="w-4 h-4 mr-2" />
          {t("requestToJoin")}
        </Button>

        <Dialog open={showRequestModal} onOpenChange={setShowRequestModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("requestToJoin")}</DialogTitle>
              <DialogDescription>
                Send a message to the tribe admins (optional)
              </DialogDescription>
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
                Cancel
              </Button>
              <Button onClick={() => handleJoin()} disabled={isPending}>
                {isPending ? "Sending..." : "Send Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // For public tribes
  return (
    <Button
      onClick={() => handleJoin()}
      className="w-full px-4 py-3"
      disabled={isPending}
    >
      <UserPlus className="w-4 h-4 mr-2" />
      {isPending ? "Joining..." : t("joinTribe")}
    </Button>
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
      {isPending ? "Cancelling..." : t("cancelRequest")}
    </Button>
  );
}
