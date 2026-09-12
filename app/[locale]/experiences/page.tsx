import { getTranslations } from "next-intl/server";
import { ExperienceList } from "@/components/experiences/list";
import { Link } from "@/lib/i18n/routing";
import { categories } from "@/lib/experiences/schema";
import { createClient } from "@/lib/supabase/server";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    title: "Firsthand experiences in Đà Lạt",
    alternates: {
      canonical: `https://dalat.app${locale === "en" ? "" : "/" + locale}/experiences`,
    },
  };
}
export default async function Experiences({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
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
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <header className="space-y-3">
        <p className="uppercase tracking-widest text-xs text-muted-foreground">
          Đà Lạt · {t("experiences")}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          {t("discovery")}
        </h1>
        <p className="text-muted-foreground">{t("discoveryHint")}</p>
        <Link
          href="/experiences/new"
          className="inline-flex rounded-xl bg-primary text-primary-foreground px-5 py-3"
        >
          {t("newExperience")}
        </Link>
      </header>
      {!!drafts?.length && (
        <section className="rounded-2xl border p-5 space-y-3">
          <h2 className="font-medium">{t("privateNotice")}</h2>
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
      )}
      <nav className="flex gap-2 flex-wrap">
        <Link href="/experiences" className="rounded-full border px-4 py-2">
          {t("all")}
        </Link>
        {categories.map((c) => (
          <Link
            key={c}
            href={`/experiences?category=${c}`}
            className={`rounded-full border px-4 py-2 ${category === c ? "bg-primary text-primary-foreground" : ""}`}
          >
            {t(c)}
          </Link>
        ))}
      </nav>
      <ExperienceList
        category={
          categories.includes(category as (typeof categories)[number])
            ? category
            : undefined
        }
      />
    </main>
  );
}
