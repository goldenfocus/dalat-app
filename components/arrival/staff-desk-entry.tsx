"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import type { ArrivalAccess } from "@/lib/arrival/types";
import { useViewer } from "@/lib/hooks/use-viewer";

/** Read permissions privately: the public event HTML may be cached. */
export function StaffDeskEntry({ slug, access }: { slug: string; access?: ArrivalAccess }) {
  const t = useTranslations("arrival");
  const { profile } = useViewer();
  const viewerId = profile?.id;
  const [resolved, setResolved] = useState<{ slug: string; viewerId: string; access: ArrivalAccess } | null>(null);

  useEffect(() => {
    if (access || !viewerId) return;
    const controller = new AbortController();
    void fetch(`/api/events/${encodeURIComponent(slug)}/arrival/access`, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (response.ok && !controller.signal.aborted) {
        const data: ArrivalAccess = await response.json();
        if (!controller.signal.aborted) setResolved({ slug, viewerId, access: data });
      }
    }).catch(() => { /* A failed permission check never shows privileged controls. */ });
    return () => controller.abort();
  }, [slug, access, viewerId]);

  const permissions = access || (resolved?.slug === slug && resolved.viewerId === viewerId ? resolved.access : null);
  if (!permissions || !(permissions.canWelcome || permissions.canOrder || permissions.canManage)) return null;
  const tasks = [permissions.canWelcome && t("hostArrivals"), permissions.canOrder && t("hostOrders"), permissions.canManage && t("hostTeam")].filter(Boolean).join(" · ");

  return <Link href={`/events/${slug}/host`} className="my-5 flex min-h-20 items-center gap-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-foreground transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <ClipboardCheck aria-hidden className="h-7 w-7 shrink-0 text-primary" />
    <span className="min-w-0 flex-1"><span className="block text-lg font-semibold">{t("staffDesk")}</span><span className="mt-1 block text-sm text-muted-foreground">{tasks}</span></span>
    <ArrowRight aria-hidden className="h-5 w-5 shrink-0" />
  </Link>;
}
