"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/i18n/routing";
import type { DrinkSelection } from "@/lib/arrival/drink-selection";

export function EventDrinkAction({ slug, selection }: { slug: string; selection: DrinkSelection | undefined }) {
  const t = useTranslations("arrival.registration");
  return <div className="space-y-2">
    {selection && <p className="flex items-start justify-center gap-2 text-sm" role="status">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span>{t("drinkSelected")}<span className="block text-muted-foreground">
        {selection.items.map(item => `${item.qty} × ${item.name_snapshot}`).join(" · ")}
      </span></span>
    </p>}
    <Button asChild variant={selection ? "outline" : "default"} className="min-h-12 w-full">
      <Link href={`/events/${slug}/prepare`}>{t(selection === null ? "chooseDrink" : "viewDrink")}</Link>
    </Button>
  </div>;
}
