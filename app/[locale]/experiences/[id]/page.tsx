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
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const e = await getExperience(id);
  if (!e)
    return {
      title: "Experience not found",
      robots: { index: false },
      alternates: { canonical: "https://dalat.app/experiences" },
    };
  const url = canonicalExperience(id, e.original_language);
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
  const { id } = await params;
  const e = await getExperience(id);
  if (!e) notFound();
  const story = saveSchema.parse(e);
  const db = await createClient();
  const t = await getTranslations("experiences");
  const [
    { data: author },
    {
      data: { user },
    },
    { data: venue },
  ] = await Promise.all([
    db
      .from("profiles")
      .select("display_name,username,avatar_url")
      .eq("id", e.author_id)
      .maybeSingle(),
    db.auth.getUser(),
    e.venue_id
      ? db
          .from("venues")
          .select("slug,name,address,google_maps_url,latitude,longitude")
          .eq("id", e.venue_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const url = canonicalExperience(id, e.original_language);
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
        <p className="text-sm">
          {t("by")}{" "}
          <Link
            className="underline"
            href={`/${author?.username || e.author_id}`}
          >
            {author?.username
              ? `@${author.username}`
              : author?.display_name || t("by")}
          </Link>{" "}
          · {t("visited")} <time dateTime={e.visit_date}>{e.visit_date}</time>
        </p>
      </header>
      {e.status === "published" && (
        <section
          className="rounded-2xl border bg-muted/30 p-5 space-y-3"
          aria-label={t("canDoToo")}
        >
          <h2 className="text-xl font-semibold">{t("canDoToo")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("availabilityUnknown")}
          </p>
          <div className="flex flex-wrap gap-3">
            {venue?.slug ? (
              <Link
                className="rounded-xl bg-primary px-4 py-3 text-primary-foreground"
                href={`/${venue.slug}`}
              >
                {t("exploreVenue")}
              </Link>
            ) : e.category === "culture" ? (
              <Link
                className="rounded-xl bg-primary px-4 py-3 text-primary-foreground"
                href="/events/upcoming"
              >
                {t("upcomingActions")}
              </Link>
            ) : null}
            <Link
              className="rounded-xl border px-4 py-3"
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
          </div>
        </section>
      )}
      {story.selected_media.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("datedEvidence")} · {e.visit_date}
        </p>
      )}
      {story.selected_media.map((m, i) => {
        const photo = story.photos.find((p) => p.id === m);
        return (
          <figure key={m}>
            <img
              src={`/experience-media/${id}/${m}`}
              alt={photo?.alt || t("originalPhoto")}
              fetchPriority={i === 0 ? "high" : undefined}
              loading={i === 0 ? "eager" : "lazy"}
              className="w-full rounded-2xl"
            />
            {photo?.caption && (
              <figcaption className="mt-2 text-sm text-muted-foreground">
                {photo.caption}
              </figcaption>
            )}
          </figure>
        );
      })}
      <article
        lang={e.original_language}
        className="whitespace-pre-wrap text-lg leading-relaxed"
      >
        <AttributedText text={e.narrative} username={author?.username} />
      </article>
      {!!e.venue_name && (
        <section className="rounded-2xl border p-5 space-y-3">
          <h2 className="text-xl font-semibold">
            {venue ? (
              <Link href={`/${venue.slug}`} className="underline">
                {venue.name}
              </Link>
            ) : (
              e.venue_name
            )}
          </h2>
          <p>{e.venue_address}</p>
          {!venue && (
            <p className="text-sm text-muted-foreground">{t("pending")}</p>
          )}
          <a
            className="inline-block min-h-11 py-2 underline"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.venue_name + " " + e.venue_address)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("directions")}
          </a>
        </section>
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
                <AttributedText text={o.value} username={author?.username} />
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
        <p>
          <AttributedText text={t("provenance")} username={author?.username} />
        </p>
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
