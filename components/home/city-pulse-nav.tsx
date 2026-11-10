import { CalendarDays, MoonStar, Radio } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";

interface CityPulseNavProps {
  hasHappening: boolean;
  hasTonight: boolean;
  hasWeekend: boolean;
}

/**
 * A small, server-rendered time navigator for the homepage.
 * It links to existing discovery routes and never invents activity when the
 * lifecycle query says nothing is live.
 */
export async function CityPulseNav({
  hasHappening,
  hasTonight,
  hasWeekend,
}: CityPulseNavProps) {
  const t = await getTranslations("home.cityPulse");
  const comingUp = await getTranslations("home.comingUp");
  const footer = await getTranslations("nav.footer");

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
    ...(hasTonight
      ? [
          {
            key: "tonight" as const,
            href: "/tonight" as const,
            icon: MoonStar,
            accent: "text-indigo-500 bg-indigo-500/10",
          },
        ]
      : []),
    ...(hasWeekend
      ? [
          {
            key: "weekend" as const,
            href: "/this-weekend" as const,
            icon: CalendarDays,
            accent: "text-emerald-600 bg-emerald-500/10",
          },
        ]
      : []),
  ];

  const gridColumns =
    horizons.length >= 4
      ? "grid-cols-2 lg:grid-cols-4"
      : horizons.length === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : horizons.length === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1";

  return (
    <section
      aria-label={t("title")}
      className="container max-w-6xl mx-auto px-4 pt-4 lg:pt-6"
    >
      {horizons.length > 0 ? (
        <div className={`grid gap-2.5 ${gridColumns}`}>
          {horizons.map(({ key, href, icon: Icon, accent }) => (
            <Link
              key={key}
              href={href}
              className="group flex min-h-20 items-center gap-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent}`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">
                  {t(`${key}.title`)}
                </span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                  {t(`${key}.description`)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-center">
          <p className="text-sm text-muted-foreground">
            {comingUp("emptyDescription")}
          </p>
          <Link
            href="/discover"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98]"
          >
            {footer("discover")}
          </Link>
        </div>
      )}
    </section>
  );
}
