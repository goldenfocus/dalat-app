import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { venueEditor } from "@/lib/venues/access";
import { getMenuForEditing } from "@/lib/menu/queries";
import { MenuEditor } from "@/components/menu/menu-editor";
import { PreorderList } from "@/components/menu/preorder-list";
import { MenuIntl } from "@/components/menu/menu-intl";

type Props = { params: Promise<{ locale: string; slug: string }> };
export const metadata: Metadata = { robots: { index: false } };

export default async function EditVenueMenuPage({ params }: Props) {
  const { slug, locale } = await params;
  const db = await createClient();
  const { data: venue } = await db
    .from("venues")
    .select("id,slug,name,preorder_enabled")
    .eq("slug", slug)
    .maybeSingle();
  if (!venue) notFound();
  const editor = await venueEditor(venue.id);
  if (!editor) redirect(`/${locale}/venues/${slug}/claim`);

  const [t, sections] = await Promise.all([getTranslations("venueMenu"), getMenuForEditing(venue.id)]);

  return (
    <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
      <div className="space-y-2">
        <Link
          href={`/${venue.slug}`}
          className="-ml-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-foreground active:scale-95 active:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{venue.name}</span>
        </Link>
        <h1 className="text-2xl font-semibold">{t("managerTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("managerHint")}</p>
      </div>
      <MenuIntl>
        <PreorderList venueId={venue.id} locale={locale} />
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold">{t("menuTitle")}</h2>
          <MenuEditor venueId={venue.id} initialSections={sections} preorderEnabled={!!venue.preorder_enabled} />
        </section>
      </MenuIntl>
    </main>
  );
}
