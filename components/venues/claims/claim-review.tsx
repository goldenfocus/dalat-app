"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function VenueClaimReview({ claimId }: { claimId: string }) {
  const t = useTranslations("venueClaim");
  const [done, setDone] = useState<string | null>(null);
  const act = async (action: "approve" | "reject") => {
    const res = await fetch(`/api/admin/venue-claims/${claimId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setDone(res.ok ? (action === "approve" ? t("approved") : t("rejected")) : t("failed"));
  };
  if (done) return <span className="text-sm text-muted-foreground">{done}</span>;
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => act("approve")}>{t("approve")}</Button>
      <Button size="sm" variant="outline" onClick={() => act("reject")}>{t("reject")}</Button>
    </div>
  );
}
