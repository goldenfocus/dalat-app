import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { TribeCard } from "@/components/tribes/tribe-card";
import { getDiscoverTribes } from "@/lib/tribes";

/**
 * Homepage discovery strip for tribes. Renders nothing when there are no
 * listed tribes (or the fetch fails) so the homepage is never degraded.
 */
export async function TribesStrip() {
  const tribes = await getDiscoverTribes();
  if (tribes.length === 0) return null;
  const t = await getTranslations("tribes");

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">{t("findYourTribe")}</h2>
        <Link
          href="/tribes"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 -mr-3 rounded-lg"
        >
          {t("seeAll")}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
        {tribes.slice(0, 8).map((tribe) => (
          <div key={tribe.id} className="w-56 shrink-0 snap-start">
            <TribeCard tribe={tribe} />
          </div>
        ))}
      </div>
    </section>
  );
}
