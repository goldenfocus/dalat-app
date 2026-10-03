"use client";

import { useState } from "react";
import { useRouter } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function PeopleReportReview({ id }: { id: string }) {
  const t = useTranslations("people");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function review() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/people/review", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "reviewed" }), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("review_failed");
      router.refresh();
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <Button type="button" variant="outline" className="min-h-11 active:scale-95" disabled={busy} onClick={review}>{t("markReviewed")}</Button>
    {failed && <p role="alert" className="text-sm text-destructive">{t("actionError")}</p>}
  </div>;
}
