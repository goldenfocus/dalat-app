"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { formatVnd } from "@/lib/menu/format";
import type { MenuSection } from "@/lib/menu/types";

export type ExistingPreorder = {
  id: string;
  status: "pending" | "confirmed";
  total_vnd: number;
  note: string | null;
  phone: string | null;
  items: { menu_item_id: string | null; qty: number }[];
};

/** Maps the RPC's raise-exception text to a translated message key. */
function errorKey(message: string): "errorClosed" | "errorSoldOut" | "errorGeneric" {
  if (message.includes("event_not_open_for_preorder") || message.includes("preorder_disabled")) return "errorClosed";
  if (message.includes("item_unavailable") || message.includes("no_orderable_items")) return "errorSoldOut";
  return "errorGeneric";
}

export function PreorderPanel({
  eventId,
  venueName,
  sections,
  isLoggedIn,
  loginHref,
  existing,
}: {
  eventId: string;
  venueName: string;
  sections: MenuSection[];
  isLoggedIn: boolean;
  loginHref: string;
  existing: ExistingPreorder | null;
}) {
  const t = useTranslations("venueMenu");
  const locale = useLocale();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries((existing?.items ?? []).filter((i) => i.menu_item_id).map((i) => [i.menu_item_id!, i.qty])),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [busy, setBusy] = useState(false);

  const itemsById = useMemo(
    () => new Map(sections.flatMap((s) => s.items).map((i) => [i.id, i])),
    [sections],
  );
  const orderable = (id: string) => !!itemsById.get(id) && !itemsById.get(id)!.is_sold_out;
  const lines = Object.entries(qty).filter(([id, n]) => n > 0 && orderable(id));
  // lines from an earlier preorder whose item has since sold out or been unlisted
  const dropped = (existing?.items ?? []).some((i) => !i.menu_item_id || !orderable(i.menu_item_id));
  const count = lines.reduce((sum, [, n]) => sum + n, 0);
  const total = lines.reduce((sum, [id, n]) => sum + itemsById.get(id)!.price_vnd * n, 0);

  const bump = (id: string, delta: number) =>
    setQty((q) => ({ ...q, [id]: Math.min(20, Math.max(0, (q[id] ?? 0) + delta)) }));

  const submit = async () => {
    setBusy(true);
    const db = createClient();
    const { error } = await db.rpc("create_event_preorder", {
      p_event_id: eventId,
      p_items: lines.map(([item_id, n]) => ({ item_id, qty: n })),
      p_note: note || null,
      p_phone: phone || null,
    });
    setBusy(false);
    if (error) {
      toast.error(t(errorKey(error.message)));
      return;
    }
    toast.success(t("placedTitle"), { description: t("placedBody", { venue: venueName }) });
    setOpen(false);
    router.refresh();
  };

  const cancel = async () => {
    if (!existing) return;
    setBusy(true);
    const { error } = await createClient().rpc("set_preorder_status", {
      p_preorder_id: existing.id,
      p_status: "cancelled",
    });
    setBusy(false);
    if (error) {
      toast.error(t("errorGeneric"));
      return;
    }
    toast.success(t("cancelled"));
    setQty({});
    setOpen(false);
    router.refresh();
  };

  if (!isLoggedIn) {
    return (
      <Button asChild className="w-full min-h-11">
        <Link href={loginHref}>{t("signInToPreorder")}</Link>
      </Button>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="w-full min-h-11" variant={existing ? "outline" : "default"}>
          <ShoppingBag />
          {existing ? t("editPreorder") : t("browseMenu")}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4 pr-12">
          <SheetTitle>{t("sheetTitle", { venue: venueName })}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {dropped && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">{t("droppedItems")}</p>
          )}
          {sections.map((s) => (
            <section key={s.id}>
              <h3 className="font-semibold">{s.title}</h3>
              {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
              <ul className="mt-2 divide-y">
                {s.items.map((i) => {
                  const n = qty[i.id] ?? 0;
                  return (
                    <li key={i.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${i.is_sold_out ? "text-muted-foreground line-through" : ""}`}>
                          {i.name}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {i.is_sold_out ? t("soldOut") : formatVnd(i.price_vnd, locale)}
                        </p>
                      </div>
                      {!i.is_sold_out && (
                        <div className="flex items-center gap-1">
                          {n > 0 && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-11 w-11"
                                aria-label={t("remove", { name: i.name })}
                                onClick={() => bump(i.id, -1)}
                              >
                                <Minus />
                              </Button>
                              <span className="w-6 text-center text-sm font-semibold tabular-nums">{n}</span>
                            </>
                          )}
                          <Button
                            type="button"
                            variant={n > 0 ? "default" : "outline"}
                            size="icon"
                            className="h-11 w-11"
                            aria-label={t("add", { name: i.name })}
                            onClick={() => bump(i.id, 1)}
                          >
                            <Plus />
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <div className="space-y-3 border-t pt-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("noteLabel")}</span>
              <Textarea
                rows={2}
                maxLength={500}
                className="text-base"
                placeholder={t("notePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("phoneLabel")}</span>
              <Input
                type="tel"
                maxLength={40}
                className="text-base"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="space-y-2 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">
              {count > 0 ? t("itemsInOrder", { count }) : t("emptyCart")}
            </span>
            <span className="text-lg font-semibold tabular-nums">{formatVnd(total, locale)}</span>
          </div>
          <Button className="w-full min-h-11" disabled={busy || count === 0} loading={busy} onClick={submit}>
            {existing ? t("update") : t("place")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("payAtVenue")}</p>
          {existing && (
            <Button type="button" variant="ghost" className="w-full min-h-11 text-destructive" disabled={busy} onClick={cancel}>
              {t("cancelPreorder")}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
