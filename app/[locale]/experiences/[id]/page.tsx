import { translatedExperience } from "@/lib/translations/public-content";
import { OriginalText } from "@/components/ui/original-text";
import {
  TopicLinks,
  ObservationText,
} from "@/components/experiences/topic-links";
import { suggestsEventDiscovery } from "@/lib/experiences/actions";
import { AttributedText } from "@/components/experiences/attributed-text";
import { attributedPlainText } from "@/lib/experiences/attribution";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { getTranslations } from "next-intl/server";
import { canonicalExperience, saveSchema } from "@/lib/experiences/schema";
import { ExperienceList } from "@/components/experiences/list";
import { ShareExperience } from "@/components/experiences/share";
import { ExperiencePhotoGallery } from "@/components/experiences/photo-gallery";
import { MapPin, Navigation, Star, ChevronRight } from "lucide-react";
const getExperience = cache(async (id: string) => {
  const db = await createClient();
  const { data } = await db
    .from("experiences")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
});
type Props = { params: Promise<{ locale: string; id: string }> };
type VenueRow = {
  slug: string;
  name: string;
  address: string | null;
  google_maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  cover_photo_url: string | null;
  logo_url: string | null;
  photos: { url: string }[] | null;
  google_rating: number | null;
  google_user_rating_count: number | null;
  google_photos: { name: string }[] | null;
  google_place_id: string | null;
};
function venueImage(v: VenueRow | null, fallback: string | null) {
  if (v?.cover_photo_url) return v.cover_photo_url;
  if (v?.photos?.[0]?.url) return v.photos[0].url;
  if (v?.google_photos?.[0]?.name)
    return `/api/places/photo?w=400&name=${encodeURIComponent(v.google_photos[0].name)}`;
  return fallback;
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, locale } = await params;
  const original = await getExperience(id);
  const e = original ? await translatedExperience(original, locale) : null;
  if (!e)
    return {
      title: "Experience not found",
      robots: { index: false },
      alternates: { canonical: "https://dalat.app/experiences" },
    };
  const url = canonicalExperience(id, locale);
  const image = e.selected_media[0]
    ? `https://dalat.app/experience-media/${id}/${e.selected_media[0]}`
    : undefined;
  return {
    title: e.title,
    description: e.summary,
    alternates: { canonical: url },
    robots: {
      index: e.status === "published",
      follow: e.status === "published",
    },
    openGraph: {
      type: "article",
      url,
      title: e.title,
      description: e.summary,
      publishedTime: e.published_at || undefined,
      modifiedTime: e.updated_at,
      images: image
        ? [
            {
              url: image,
              alt:
                e.photos.find(
                  (p: { id: string }) => p.id === e.selected_media[0],
                )?.alt || e.title,
            },
          ]
        : [],
    },
    twitter: { card: "summary_large_image" },
  };
}
export default async function ExperiencePage({ params }: Props) {
  const { id, locale } = await params;
  const original = await getExperience(id);
  const e = original ? await translatedExperience(original, locale) : null;
  if (!e) notFound();
  const originalStory = saveSchema.parse(original);
  const story = { ...originalStory, ...e } as typeof originalStory;
  const db = await createClient();
  const t = await getTranslations("experiences");
  const [
    { data: author },
    {
      data: { user },
    },
    { data: venueData },
  ] = await Promise.all([
    db
      .from("profiles")
      .select("display_name,username,avatar_url,bio")
      .eq("id", e.author_id)
      .maybeSingle(),
    db.auth.getUser(),
    e.venue_id
      ? db
          .from("venues")
          .select(
            "slug,name,address,google_maps_url,latitude,longitude,cover_photo_url,logo_url,photos,google_rating,google_user_rating_count,google_photos,google_place_id",
          )
          .eq("id", e.venue_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const venue = venueData as VenueRow | null;
  const visited = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${e.visit_date}T00:00:00Z`));
  const placeName = venue?.name || e.venue_name;
  const placeAddress = venue?.address || e.venue_address;
  // Name + address beats raw coordinates: OSM fallbacks can be street-level.
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    [placeName, placeAddress].filter(Boolean).join(", "),
  )}${venue?.google_place_id ? `&destination_place_id=${encodeURIComponent(venue.google_place_id)}` : ""}`;
  const venueThumb = venueImage(
    venue,
    story.selected_media[0]
      ? `/experience-media/${id}/${story.selected_media[0]}`
      : null,
  );
  const bioLine = (author?.bio || "").split(/\n+/).slice(0, 2).join(" ").trim();
  const url = canonicalExperience(id, locale);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: e.title,
    description: e.summary,
    articleBody: attributedPlainText(e.narrative, author?.username),
    inLanguage: e.original_language,
    datePublished: e.published_at,
    dateModified: e.updated_at,
    author: {
      "@type": "Person",
      name: author?.display_name || author?.username || "Contributor",
      ...(author?.username
        ? { url: `https://dalat.app/${author.username}` }
        : {}),
    },
    image: e.selected_media.map(
      (m: string) => `https://dalat.app/experience-media/${id}/${m}`,
    ),
    ...(e.venue_name
      ? { about: { "@type": "Place", name: e.venue_name } }
      : {}),
    url,
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-7">
      <Link href="/experiences" className="text-sm text-muted-foreground">
        ← {t("experiences")}
      </Link>
      {e.status === "draft" && (
        <p className="rounded-xl bg-muted p-4">
          {t("draft")} · {t("privateHelp")}
        </p>
      )}
      <header className="space-y-4">
        <Link
          href={`/experiences?category=${e.category}`}
          className="text-xs uppercase tracking-widest text-muted-foreground"
        >
          {t(e.category)}
        </Link>
        <h1 className="text-3xl sm:text-5xl leading-tight font-semibold tracking-tight">
          {e.title || t("draft")}
        </h1>
        <p className="text-lg text-muted-foreground">
          <AttributedText text={e.summary} username={author?.username} />
        </p>
        <Link
          href={`/${author?.username || e.author_id}`}
          className="flex items-center gap-3 rounded-2xl border p-3 transition-colors hover:bg-muted/50"
        >
          {author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={author.avatar_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold">
              {(author?.display_name || author?.username || "?").slice(0, 1)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {author?.display_name ||
                (author?.username ? `@${author.username}` : t("by"))}
              {author?.display_name && author?.username && (
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  @{author.username}
                </span>
              )}
            </span>
            {bioLine && (
              <span className="line-clamp-2 text-sm text-muted-foreground">
                {bioLine}
              </span>
            )}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
        <p className="text-sm text-muted-foreground">
          <time dateTime={e.visit_date}>
            {t("visitedFreshness", { date: visited })}
          </time>
        </p>
      </header>
      {!!placeName && (
        <section
          aria-label={placeName}
          className="overflow-hidden rounded-2xl border bg-card shadow-sm"
        >
          <Link
            href={venue?.slug ? `/${venue.slug}` : `/experiences/${id}`}
            className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/40"
          >
            {venueThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={venueThumb}
                alt=""
                className="h-20 w-20 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-muted">
                <MapPin className="h-7 w-7 text-muted-foreground" />
              </span>
            )}
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block text-lg font-semibold leading-tight">
                {placeName}
              </span>
              {venue?.google_rating != null && (
                <span className="flex items-center gap-1 text-sm">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span className="font-medium">
                    {venue.google_rating.toFixed(1)}
                  </span>
                  <span className="text-muted-foreground">
                    {t("googleReviews", {
                      count: venue.google_user_rating_count || 0,
                    })}
                  </span>
                </span>
              )}
              {placeAddress && (
                <span className="line-clamp-2 text-sm text-muted-foreground">
                  {placeAddress}
                </span>
              )}
              {venue?.slug && (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {t("viewVenue")} <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </span>
          </Link>
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 border-t bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Navigation className="h-4 w-4" />
            {t("directionsGoogle")}
          </a>
        </section>
      )}
      <TopicLinks tags={story.tags} observations={story.observations} />
      {e.status === "published" && (
        <nav
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
          aria-label={t("canDoToo")}
        >
          <span className="text-muted-foreground">{t("canDoToo")}</span>
          {!venue?.slug &&
            suggestsEventDiscovery(
              e.category,
              `${e.title} ${e.summary} ${e.narrative}`,
            ) && (
              <Link className="min-h-11 py-3 underline" href="/events/upcoming">
                {t("upcomingActions")}
              </Link>
            )}
          <Link
            className="min-h-11 py-3 underline"
            href={`/experiences/new?from=${id}`}
          >
            {e.venue_id ? t("experiencedToo") : t("newExperience")}
          </Link>
          {author?.username && (
            <Link
              className="min-h-11 py-3 underline"
              href={`/${author.username}`}
            >
              {t("moreCreator")}
            </Link>
          )}
        </nav>
      )}
      <ExperiencePhotoGallery
        experienceId={id}
        title={e.title}
        authorId={e.author_id}
        userId={user?.id}
        photos={story.selected_media.map((m) => {
          const photo = story.photos.find((p) => p.id === m);
          return {
            id: m,
            alt: photo?.alt || t("originalPhoto"),
            caption: photo?.caption || null,
          };
        })}
      />
      <article
        lang={locale}
        className="whitespace-pre-wrap text-lg leading-relaxed"
      >
        <AttributedText text={e.narrative} username={author?.username} />
      </article>
      {original && JSON.stringify(e) !== JSON.stringify(original) && (
        <OriginalText
          text={[
            original.title,
            original.summary,
            original.narrative,
            original.sponsorship,
            ...original.observations.map(
              (o: { subject: string; value: string; context: string }) =>
                `${o.subject}: ${o.value} ${o.context}`,
            ),
            ...original.photos.map(
              (p: { alt: string; caption: string }) => `${p.alt} ${p.caption}`,
            ),
          ].join("\n\n")}
          sourceLocale={original.original_language}
        />
      )}
      {!!story.observations.length && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">{t("observations")}</h2>
          {story.observations.map((o, i) => (
            <div key={i} className="border-l-2 pl-4">
              <p className="text-xs text-muted-foreground">
                {t(o.source_type)}
              </p>
              <p>
                <ObservationText
                  value={o.value}
                  source={o.source_type}
                  tags={story.tags}
                  username={author?.username}
                />
              </p>
              <p className="text-sm text-muted-foreground">
                <AttributedText text={o.context} username={author?.username} />{" "}
                · {e.visit_date}
              </p>
            </div>
          ))}
        </section>
      )}
      <footer className="border-t pt-5 space-y-3 text-sm text-muted-foreground">
        {e.sponsorship && (
          <p>
            {t("sponsorship")}: {e.sponsorship}
          </p>
        )}
        <p>
          {t("published")}: {e.published_at?.slice(0, 10) || "—"} ·{" "}
          {t("updated")}: {e.updated_at.slice(0, 10)}
        </p>
        <p>
          {t("originalLanguage")}: {e.original_language}
        </p>
        <div className="flex gap-4 flex-wrap">
          {e.status === "published" && (
            <ShareExperience
              url={url}
              label={t("share")}
              copied={t("copied")}
            />
          )}{" "}
          {user?.id === e.author_id && (
            <Link
              className="min-h-11 py-3 underline"
              href={`/experiences/${id}/edit`}
            >
              {t("edit")}
            </Link>
          )}
        </div>
      </footer>
      {e.status === "published" && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
            }}
          />
          <ExperienceList
            venueId={e.venue_id || undefined}
            category={e.venue_id ? undefined : e.category}
            excludeId={id}
          />
        </>
      )}
    </main>
  );
}
