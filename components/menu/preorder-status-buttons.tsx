"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/lib/i18n/routing";

type Status = "pending" | "confirmed" | "fulfilled" | "cancelled";

export function PreorderStatusButtons({ id, status, eventSlug, readyForPreparation }: {
  id: string; status: Status; eventSlug: string; readyForPreparation: boolean;
}) {
  const t = useTranslations("venueMenu");
  const ta = useTranslations("arrival");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const set = async (next: Status) => {
    setBusy(true);
    try {
      const { error } = await createClient().rpc("set_preorder_status", { p_preorder_id: id, p_status: next });
      if (error) {
        if (error.message.includes("arrival_required")) {
          toast.error(ta("sponsorWaitForCheckIn"));
          startTransition(() => router.refresh());
        } else toast.error(t("errorGeneric"));
        return;
      }
      startTransition(() => router.refresh());
    } catch { toast.error(t("errorGeneric")); }
    finally { setBusy(false); }
  };

  if (status === "fulfilled" || status === "cancelled") return null;
  return (
    <div className="space-y-2">
      {!readyForPreparation && <p className="text-sm text-muted-foreground">{ta("sponsorWaitForCheckIn")}</p>}
      <div className="flex flex-wrap gap-2">
      {!readyForPreparation && <Link href={`/events/${eventSlug}/host`}
        className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium hover:bg-muted">{ta("viewHost")}</Link>}
      {readyForPreparation && status === "pending" && (
        <Button size="sm" className="min-h-11" disabled={busy} onClick={() => set("confirmed")}>
          {t("markConfirmed")}
        </Button>
      )}
      {readyForPreparation && <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => set("fulfilled")}>
        {t("markFulfilled")}
      </Button>}
      <Button size="sm" variant="ghost" className="min-h-11 text-destructive" disabled={busy} onClick={() => set("cancelled")}>
        {t("cancelPreorder")}
      </Button>
      </div>
    </div>
  );
}
