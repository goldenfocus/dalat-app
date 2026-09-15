import { topic, topicHref } from "@/lib/experiences/topics";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ExperienceList } from "@/components/experiences/list";
import { Link } from "@/lib/i18n/routing";
import { categories } from "@/lib/experiences/schema";
import { createClient } from "@/lib/supabase/server";
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tag?: string }>;
}) {
  const { locale } = await params;
  return {
    title: "Firsthand experiences in Đà Lạt",
    ...((await searchParams).tag
      ? { robots: { index: false, follow: true } }
      : {}),
    alternates: {
      canonical: `https://dalat.app${locale === "en" ? "" : "/" + locale}/experiences`,
    },
  };
}
export default async function Experiences({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; tag?: string; page?: string }>;
}) {
  const query = await searchParams;
  const category = categories.includes(
    query.category as (typeof categories)[number],
  )
    ? query.category
    : undefined;
  const tag = topic(query.tag);
  const page = Math.min(
    417,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const t = await getTranslations("experiences");
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <header className="space-y-3">
        <p className="uppercase tracking-widest text-xs text-muted-foreground">
          Đà Lạt · {t("experiences")}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          {tag ? `#${tag}` : t("discovery")}
        </h1>
        <p className="text-muted-foreground">
          {tag ? t("topicHint") : t("discoveryHint")}
        </p>
        {tag && (
          <Link href="/experiences" className="block underline">
            {t("clearTopic")}
          </Link>
        )}
        <Link
          href="/experiences/new"
          className="inline-flex rounded-xl bg-primary text-primary-foreground px-5 py-3"
        >
          {t("newExperience")}
        </Link>
      </header>
      {!tag && (
        <Suspense fallback={null}>
          <PrivateDrafts />
        </Suspense>
      )}
      <nav className="flex gap-2 flex-wrap">
        <Link
          href={tag ? topicHref(tag) : "/experiences"}
          className="rounded-full border px-4 py-2"
        >
          {t("all")}
        </Link>
        {categories.map((c) => (
          <Link
            key={c}
            href={tag ? topicHref(tag, c) : `/experiences?category=${c}`}
            className={`rounded-full border px-4 py-2 ${category === c ? "bg-primary text-primary-foreground" : ""}`}
          >
            {t(c)}
          </Link>
        ))}
      </nav>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        }
      >
        <ExperienceList
          showEmpty
          tag={tag}
          page={page}
          category={
            categories.includes(category as (typeof categories)[number])
              ? category
              : undefined
          }
        />
      </Suspense>
    </main>
  );
}

async function PrivateDrafts() {
  const t = await getTranslations("experiences");
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { data: drafts } = user
    ? await db
        .from("experiences")
        .select("id,title,created_at")
        .eq("author_id", user.id)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };
  if (!drafts?.length) return null;
  return (
    <section className="rounded-2xl border p-5 space-y-3">
      <h2 className="font-medium">{t("myDrafts")}</h2>
      {drafts.map((d) => (
        <Link
          key={d.id}
          href={`/experiences/${d.id}/edit`}
          className="block min-h-11 py-2 underline"
        >
          {d.title || t("draft")} · {d.created_at.slice(0, 10)}
        </Link>
      ))}
    </section>
  );
}
