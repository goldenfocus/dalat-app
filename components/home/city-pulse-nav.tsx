import { CalendarDays, Clock3, MoonStar, Radio } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";

interface CityPulseNavProps {
  hasHappening: boolean;
}

/**
 * A small, server-rendered time navigator for the homepage.
 * It links to existing discovery routes and never invents activity when the
 * lifecycle query says nothing is live.
 */
export async function CityPulseNav({ hasHappening }: CityPulseNavProps) {
  const t = await getTranslations("home.cityPulse");

  const horizons = [
    ...(hasHappening
      ? [
          {
            key: "live" as const,
            href: "/#happening-now" as const,
            icon: Radio,
            accent: "text-red-500 bg-red-500/10",
          },
        ]
      : []),
    {
      key: "tonight" as const,
      href: "/tonight" as const,
      icon: MoonStar,
      accent: "text-indigo-500 bg-indigo-500/10",
    },
    {
      key: "weekend" as const,
      href: "/this-weekend" as const,
      icon: CalendarDays,
      accent: "text-emerald-600 bg-emerald-500/10",
    },
    {
      key: "allDates" as const,
      href: "/events/upcoming" as const,
      icon: Clock3,
      accent: "text-amber-600 bg-amber-500/10",
    },
  ];

  return (
    <section
      aria-labelledby="city-pulse-title"
      className="container max-w-6xl mx-auto px-4 pt-4 lg:pt-6"
    >
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t("eyebrow")}
        </p>
        <div className="mt-1 sm:flex sm:items-end sm:justify-between sm:gap-6">
          <h2 id="city-pulse-title" className="text-xl font-bold tracking-tight sm:text-2xl">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground sm:mt-0">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div
        className={`grid gap-2.5 ${
          horizons.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"
        }`}
      >
        {horizons.map(({ key, href, icon: Icon, accent }) => (
          <Link
            key={key}
            href={href}
            className="group flex min-h-20 items-center gap-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{t(`${key}.title`)}</span>
              <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                {t(`${key}.description`)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
