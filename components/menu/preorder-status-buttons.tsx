"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Status = "pending" | "confirmed" | "fulfilled" | "cancelled";

export function PreorderStatusButtons({ id, status }: { id: string; status: Status }) {
  const t = useTranslations("venueMenu");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const set = async (next: Status) => {
    setBusy(true);
    const { error } = await createClient().rpc("set_preorder_status", { p_preorder_id: id, p_status: next });
    setBusy(false);
    if (error) return toast.error(t("errorGeneric"));
    startTransition(() => router.refresh());
  };

  if (status === "fulfilled" || status === "cancelled") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending" && (
        <Button size="sm" className="min-h-11" disabled={busy} onClick={() => set("confirmed")}>
          {t("markConfirmed")}
        </Button>
      )}
      <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => set("fulfilled")}>
        {t("markFulfilled")}
      </Button>
      <Button size="sm" variant="ghost" className="min-h-11 text-destructive" disabled={busy} onClick={() => set("cancelled")}>
        {t("cancelPreorder")}
      </Button>
    </div>
  );
}
