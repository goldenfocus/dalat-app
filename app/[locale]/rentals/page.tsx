import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Frame, MapPin } from "lucide-react";
import { MomentVideoPlayer } from "@/components/moments/moment-video-player";
import { OriginalText } from "@/components/ui/original-text";
import { locales } from "@/lib/i18n/routing";
import { rentalReelCaptionKeys } from "@/lib/rentals/pilot";

const name = "King’s Paradise";
const media = "/rentals/king-paradise";
const rentTerms = [
  { key: "monthly", amount: 40_000_000 },
  { key: "sixMonths", amount: 35_000_000 },
  { key: "yearly", amount: 30_000_000 },
] as const;
const facts = ["quiet", "wifi", "water", "trails"] as const;
const gallery = [5, 4, 1, 6, 3, 2];

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  const pathFor = (language: string) => `https://dalat.app${language === "en" ? "" : `/${language}`}/rentals`;

  return {
    title: t("title"),
    description: t("intro"),
    robots: { index: false, follow: true },
    alternates: {
      canonical: pathFor(locale),
      languages: {
        ...Object.fromEntries(locales.map((language) => [language, pathFor(language)])),
        "x-default": pathFor("en"),
      },
    },
    openGraph: {
      title: t("title"),
      description: t("intro"),
      url: pathFor(locale),
      images: [`https://dalat.app${media}/photo-5.webp`],
    },
  };
}

export default async function RentalsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  const original = await getTranslations({ locale: "en", namespace: "rentalsPilot" });
  const price = new Intl.NumberFormat(locale, { style: "currency", currency: "VND" });

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-8 sm:py-12">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="max-w-prose text-muted-foreground">{t("intro")}</p>
      </header>
      <article className="grid gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-12">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="overflow-hidden rounded-2xl bg-black [&_video::cue]:bg-black/75 [&_video::cue]:font-bold [&_video::cue]:text-white">
            <MomentVideoPlayer
              src={`${media}/reel.mp4`}
              poster={`${media}/photo-5.webp`}
              autoPlay={false}
              hideMuteButton
              preload="none"
              label={t("reel", { name })}
              captions={{
                src: `/api/rentals/reel-captions/${locale}`,
                locale,
                label: t("captions"),
              }}
              className="relative aspect-[9/16] w-full bg-black"
            />
          </div>
          {locale !== "en" && (
            <OriginalText
              className="mt-2"
              sourceLocale="en"
              text={rentalReelCaptionKeys.map((key) => original(key)).join("\n")}
            />
          )}
        </div>
        <div className="min-w-0 space-y-7">
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" /> Đà Lạt
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">{name}</h2>
          </div>
          <section className="space-y-2 rounded-2xl border bg-card p-5">
            <h3 className="font-semibold">{t("rent")}</h3>
            <dl className="divide-y">
              {rentTerms.map(({ key, amount }) => (
                <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                  <dt className="text-muted-foreground">{t(key)}</dt>
                  <dd className="font-semibold tabular-nums">{price.format(amount)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="space-y-3">
            <h3 className="font-semibold">{t("highlights")}</h3>
            <ul className="flex flex-wrap gap-2">
              {facts.map((fact) => (
                <li key={fact} className="rounded-full border px-3 py-1.5 text-sm">{t(fact)}</li>
              ))}
            </ul>
          </section>
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 font-semibold">
              <Frame className="size-4" aria-hidden="true" /> {t("photos")}
            </h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {gallery.map((photo, index) => (
                <li key={photo}>
                  <a href={`${media}/photo-${photo}.webp`} aria-label={t("viewPhoto", { number: index + 1 })}
                    className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                    <Image src={`${media}/photo-${photo}.webp`} alt="" fill
                      sizes="(max-width: 640px) 48vw, 220px" className="object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </article>
    </div>
  );
}
