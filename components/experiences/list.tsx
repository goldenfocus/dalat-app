import { TopicLinks } from "./topic-links";
import { topicTerms, topicHref } from "@/lib/experiences/topics";
import { suggestsEventDiscovery } from "@/lib/experiences/actions";
import { AttributedText } from "./attributed-text";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { getTranslations } from "next-intl/server";
type ExperienceCard = {
  id: string;
  title: string;
  summary: string;
  visit_date: string;
  venue_name: string;
  selected_media: string[];
  status: string;
  category: string;
  tags: string[];
  observations: { value: string; source_type: string }[];
  author: { display_name: string | null; username: string | null } | null;
  venue: { slug: string } | null;
};
export async function ExperienceList({
  authorId,
  venueId,
  category,
  excludeId,
  showEmpty = false,
  tag,
  page = 1,
}: {
  authorId?: string;
  venueId?: string;
  category?: string;
  excludeId?: string;
  showEmpty?: boolean;
  tag?: string;
  page?: number;
}) {
  const db = await createClient();
  const t = await getTranslations("experiences");
  const columns =
    "id,title,summary,visit_date,venue_name,selected_media,status,category,tags,observations,author:profiles!experiences_author_id_fkey(display_name,username),venue:venues(slug)";
  let q = tag
    ? db
        .rpc("experiences_by_topic", {
          p_terms: topicTerms(tag),
          p_category: category || null,
          p_offset: (page - 1) * 24,
        })
        .select(columns)
    : db
        .from("experiences")
        .select(columns)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(24);
  if (authorId) q = q.eq("author_id", authorId);
  if (venueId) q = q.eq("venue_id", venueId);
  if (category && !tag) q = q.eq("category", category);
  if (excludeId) q = q.neq("id", excludeId);
  const { data: result, error } = await q;
  const rows = Array.isArray(result)
    ? (result as unknown as ExperienceCard[])
    : null;
  if (error) throw new Error("Experience discovery unavailable");
  const more = !!tag && !!rows && rows.length > 24 && page < 417;
  const data = rows?.slice(0, 24);
  if (!data?.length)
    return showEmpty ? (
      <section className="rounded-2xl border border-dashed p-8 text-center">
        <p className="text-muted-foreground">{t("empty")}</p>
      </section>
    ) : null;
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t("experiences")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {data.map((e) => (
          <article
            key={e.id}
            className="overflow-hidden rounded-2xl border bg-card group"
          >
            <Link href={`/experiences/${e.id}`}>
              {e.selected_media[0] && (
                <img
                  src={`/experience-media/${e.id}/${e.selected_media[0]}`}
                  alt={e.title}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              )}
            </Link>
            <div className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                {[e.venue_name, e.visit_date].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("pastAccount")} · {t("accessUnknown")}
                {e.selected_media.length > 0 && <> · {t("originalPhoto")}</>}
              </p>
              <h3 className="text-lg font-medium group-hover:underline">
                <Link href={`/experiences/${e.id}`}>{e.title}</Link>
              </h3>
              <TopicLinks tags={e.tags} observations={e.observations} />
              <p className="line-clamp-3 text-sm text-muted-foreground">
                <AttributedText
                  text={e.summary}
                  username={e.author?.username}
                />
              </p>
            </div>
            <div className="border-t px-4 py-3 flex flex-wrap gap-3 text-sm">
              {e.author?.username && (
                <Link
                  className="min-h-11 py-3 underline"
                  href={`/${e.author.username}`}
                >
                  {`@${e.author.username}`}
                </Link>
              )}
              {e.venue?.slug && (
                <Link
                  className="min-h-11 py-3 underline"
                  href={`/${e.venue.slug}`}
                >
                  {t("exploreVenue")}
                </Link>
              )}
              {!e.venue?.slug &&
                suggestsEventDiscovery(
                  e.category,
                  `${e.title} ${e.summary}`,
                ) && (
                  <Link
                    className="min-h-11 py-3 underline"
                    href="/events/upcoming"
                  >
                    {t("upcomingActions")}
                  </Link>
                )}
            </div>
          </article>
        ))}
      </div>
      {tag && (page > 1 || more) && (
        <nav className="flex gap-4">
          {page > 1 && (
            <Link
              className="rounded-xl border px-4 py-3"
              href={topicHref(tag, category, page - 1)}
            >
              {t("previousResults")}
            </Link>
          )}
          {more && (
            <Link
              className="rounded-xl border px-4 py-3"
              href={topicHref(tag, category, page + 1)}
            >
              {t("moreResults")}
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
