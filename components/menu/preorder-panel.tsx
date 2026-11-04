"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OriginalText } from "@/components/ui/original-text";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { ItemOrderControl } from "./item-order-control";
import { cartLines, cartTotal } from "@/components/arrival/arrival-cart";
import { optionPrice, selectionKey } from "@/lib/menu/options";
import { formatVnd } from "@/lib/menu/format";
import type { MenuSection } from "@/lib/menu/types";

export type ExistingPreorder = {
  id: string;
  status: "pending" | "confirmed";
  total_vnd: number;
  note: string | null;
  phone: string | null;
  items: { menu_item_id: string | null; qty: number; selected_options?: Record<string, string> }[];
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
    Object.fromEntries((existing?.items ?? []).filter((i) => i.menu_item_id).map((i) => [selectionKey(i.menu_item_id!, i.selected_options), i.qty])),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [busy, setBusy] = useState(false);

  const itemsById = useMemo(
    () => new Map(sections.flatMap((s) => s.items).map((i) => [i.id, i])),
    [sections],
  );
  const orderable = (id: string) => !!itemsById.get(id) && !itemsById.get(id)!.is_sold_out;
  const lines = cartLines(sections, qty);
  const dropped = (existing?.items ?? []).some(i => !i.menu_item_id || !orderable(i.menu_item_id) || optionPrice(itemsById.get(i.menu_item_id)!, i.selected_options || {}) === null);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const total = cartTotal(sections, qty);

  const submit = async () => {
    setBusy(true);
    const db = createClient();
    const { error } = await db.rpc("create_event_preorder", {
      p_event_id: eventId,
      p_items: lines,
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
                {s.items.map(i => <li key={i.id} className="py-4">
                  <p className="font-medium">{i.name}</p>
                  {i.description && <p className="text-sm text-muted-foreground">{i.description}</p>}
                  <p className="text-sm text-muted-foreground tabular-nums">{formatVnd(i.price_vnd, locale)}</p>
                  {i.originalName && (i.name !== i.originalName || i.description !== i.originalDescription) && <OriginalText text={[i.originalName, i.originalDescription].filter(Boolean).join("\n")} />}
                  <ItemOrderControl item={i} quantities={qty} onChange={setQty} disabled={busy} />
                </li>)}
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
