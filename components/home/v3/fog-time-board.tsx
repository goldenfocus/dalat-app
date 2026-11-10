import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";

interface FogTimeBoardProps {
  hasHappening: boolean;
  hasTonight: boolean;
  hasWeekend: boolean;
}

/**
 * A small, server-rendered time board for the homepage: one timetable cell
 * per horizon that has plans. It links to existing discovery routes and never
 * invents activity when the lifecycle query says nothing is live.
 */
export async function FogTimeBoard({
  hasHappening,
  hasTonight,
  hasWeekend,
}: FogTimeBoardProps) {
  const t = await getTranslations("home.cityPulse");
  const comingUp = await getTranslations("home.comingUp");
  const footer = await getTranslations("nav.footer");

  const horizons = [
    ...(hasHappening
      ? [{ key: "live" as const, href: "/v3#happening-now" as const }]
      : []),
    ...(hasTonight
      ? [{ key: "tonight" as const, href: "/tonight" as const }]
      : []),
    ...(hasWeekend
      ? [{ key: "weekend" as const, href: "/this-weekend" as const }]
      : []),
  ];

  return (
    <section
      aria-label={t("title")}
      className="container max-w-6xl mx-auto px-4 pt-2 pb-5 lg:pb-7"
    >
      {horizons.length > 0 ? (
        <div className="fog-scoop grid w-full auto-cols-fr grid-flow-col overflow-hidden border border-foreground sm:inline-grid sm:w-auto">
          {horizons.map(({ key, href }) => (
            <Link
              key={key}
              href={href}
              className="fog-cap flex min-h-12 items-center justify-center gap-2 border-l border-border px-4 text-center leading-tight text-muted-foreground transition-colors first:border-l-0 hover:bg-foreground hover:text-background active:bg-foreground active:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-6"
            >
              {key === "live" && (
                <span
                  className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500 shadow-[0_0_10px_theme(colors.red.500)]"
                  aria-hidden="true"
                />
              )}
              {t(`${key}.title`)}
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-5 text-center">
          <p className="text-sm text-muted-foreground">
            {comingUp("emptyDescription")}
          </p>
          <Link
            href="/discover"
            className="fog-cap mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98]"
          >
            {footer("discover")}
          </Link>
        </div>
      )}
    </section>
  );
}
