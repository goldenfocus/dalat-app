import { getTranslations } from "next-intl/server";
import { Search, SlidersHorizontal } from "lucide-react";
import { getPathname, type Locale } from "@/lib/i18n/routing";
import { RentalLocaleLink } from "./locale-link";
import { filterGroups, rentalBrowseHref, type rentalDiscovery } from "@/lib/rentals/discovery";

type Filter = ReturnType<typeof rentalDiscovery>["filters"][number];

export async function RentalBrowseControls({ locale, query, selected, tours, filters }: {
  locale: Locale; query: string; selected: string[]; tours: boolean; filters: Filter[];
}) {
  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  const tab = "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium aria-[current=page]:bg-muted aria-[current=page]:text-foreground";
  return <div className="space-y-3">
    <nav aria-label={t("title")} className="flex gap-1 text-muted-foreground">
      <RentalLocaleLink locale={locale} className={tab} href={rentalBrowseHref(query, selected, false)} aria-current={!tours ? "page" : undefined}>{t("listings")}</RentalLocaleLink>
      <RentalLocaleLink locale={locale} className={tab} href={rentalBrowseHref(query, selected, true)} aria-current={tours ? "page" : undefined}>{t("tours")}</RentalLocaleLink>
    </nav>
    <form key={rentalBrowseHref(query, selected, tours)} method="get" className="space-y-2">
      {tours && <input type="hidden" name="browse" value="tours" />}
      <div className="flex gap-2">
        <input type="search" name="q" defaultValue={query} maxLength={120} aria-label={t("searchRentals")}
          placeholder={t("searchRentals")} className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3" />
        <button type="submit" aria-label={t("searchRentals")} title={t("searchRentals")}
          className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Search className="size-5" aria-hidden="true" />
        </button>
      </div>
      {(filters.length > 0 || selected.length > 0) && <details className="rounded-lg border bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 font-medium [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {t("filters")}
          {selected.length > 0 && <span className="rounded-full bg-muted px-2 text-sm">{selected.length}</span>}
        </summary>
        <div className="grid gap-3 border-t p-3 sm:grid-cols-2 sm:p-4">
          {filterGroups.map(group => {
            const choices = filters.filter(filter => filter.group === group);
            if (!choices.length) return null;
            const title = group === "rooms" ? t("filterRooms") : t(group);
            return <fieldset key={group}>
              <legend className="mb-1 text-sm font-semibold">{title}</legend>
              {choices.map(choice => <label key={choice.key} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" name="filter" value={choice.key}
                  defaultChecked={selected.includes(choice.key)} className="size-4 shrink-0 accent-primary" />
                <span className="min-w-0 break-words">{choice.label}</span>
              </label>)}
            </fieldset>;
          })}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className="min-h-11 rounded-lg bg-primary px-3 font-medium text-primary-foreground">{t("applyFilters")}</button>
            <a href={getPathname({ locale, href: rentalBrowseHref("", [], tours) })} className="inline-flex min-h-11 items-center rounded-lg border px-3">{t("clearFilters")}</a>
          </div>
        </div>
      </details>}
    </form>
  </div>;
}
