import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { resolveCanonicalEventSlug } from "@/lib/events/slug-resolution";
import { TableClock } from "@/components/events/table-clock";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createStaticClient();
  if (!supabase) return { title: "Table Clock" };
  const canonicalSlug = await resolveCanonicalEventSlug(supabase, slug);
  if (!canonicalSlug) return { title: "Table Clock" };
  const { data: event } = await supabase
    .from("events")
    .select("title")
    .eq("slug", canonicalSlug)
    .single();
  return {
    title: event ? `Table Clock - ${event.title}` : "Table Clock",
    robots: { index: false },
  };
}

export default async function TableClockPage({ params }: PageProps) {
  const { slug, locale } = await params;
  const supabase = await createClient();

  const canonicalSlug = await resolveCanonicalEventSlug(supabase, slug);
  if (!canonicalSlug) {
    notFound();
  }
  if (canonicalSlug !== slug) redirect(`/${locale}/events/${canonicalSlug}/table`);

  const { data: event, error } = await supabase
    .from("events")
    .select("id, slug, title, status")
    .eq("slug", canonicalSlug)
    .single();

  if (error || !event || event.status !== "published") notFound();

  // The layout only ships core namespaces to the client provider; scope
  // pokerTable here so SSR renders real strings instead of fallback keys.
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={{ pokerTable: messages.pokerTable }}>
      <TableClock eventSlug={event.slug} eventTitle={event.title} />
    </NextIntlClientProvider>
  );
}
