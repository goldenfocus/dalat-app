"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function VenueClaimReview({ claimId, kind }: { claimId: string; kind: "venue" | "organizer" }) {
  const t = useTranslations("venueClaim");
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const act = async (action: "approve" | "reject") => {
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/venue-claims/${claimId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, kind }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setDone(action === "approve" ? t("approved") : t("rejected"));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  if (done) return <span className="text-sm text-muted-foreground">{done}</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => act("approve")}>{t("approve")}</Button>
      <Button size="sm" disabled={pending} variant="outline" onClick={() => act("reject")}>{t("reject")}</Button>
      {failed && <span role="alert" className="text-sm text-destructive">{t("failed")}</span>}
    </div>
  );
}
