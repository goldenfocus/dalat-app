import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { OriginalText } from "@/components/ui/original-text";
import { Link, type Locale } from "@/lib/i18n/routing";
import { safeRentalPhoto } from "@/lib/rentals/data";
import { rentalListingPath } from "@/lib/rentals/urls";
import { createStaticClient } from "@/lib/supabase/server";
import { translatedRecords } from "@/lib/translations/public-content";

export async function RentalsStrip({ locale }: { locale: Locale }) {
  const db = createStaticClient();
  if (!db) return null;

  const { data, error } = await db.from("rental_listings")
    .select("id,slug,title,source_locale,status,photos")
    .eq("status", "published")
    .not("slug", "is", null)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(6);
  if (error || !data?.length) return null;

  const listings = data.flatMap(listing => {
    const cover = listing.photos.find(safeRentalPhoto);
    return cover ? [{ ...listing, cover }] : [];
  }).slice(0, 3);
  if (!listings.length) return null;

  const [t, translations] = await Promise.all([
    getTranslations("rentalsPilot"),
    translatedRecords("rental", listings.filter(listing => listing.source_locale !== locale)
      .map(listing => listing.id), locale).catch(() => new Map()),
  ]);

  return (
    <section aria-labelledby="home-rentals-title" className="space-y-2">
      <h2 id="home-rentals-title" className="text-xl font-semibold">
        <Link href="/rentals" prefetch={false} className="inline-flex min-h-11 items-center gap-2 hover:underline">
          {t("title")}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </h2>
      <div className="grid grid-flow-col auto-cols-[45%] gap-3 overflow-x-auto overscroll-x-contain snap-x pb-1 sm:auto-cols-[calc((100%-2rem)/3)] sm:gap-4">
        {listings.map(listing => {
          const title = translations.get(listing.id)?.get("title") || listing.title;
          return (
            <article key={listing.id} className="min-w-0 snap-start rounded-xl border bg-card">
              <Link href={rentalListingPath(listing)} prefetch={false} className="group block rounded-xl">
                <img src={listing.cover} alt="" loading="lazy" decoding="async"
                  className="aspect-[3/2] w-full rounded-t-xl bg-muted object-cover" />
                <h3 className="px-3 py-2 text-sm font-medium leading-snug group-hover:underline">{title}</h3>
              </Link>
              {title !== listing.title && <OriginalText text={listing.title} sourceLocale={listing.source_locale} />}
            </article>
          );
        })}
      </div>
    </section>
  );
}
