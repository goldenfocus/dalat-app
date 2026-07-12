import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { TableClock } from "@/components/events/table-clock";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createStaticClient();
  if (!supabase) return { title: "Table Clock" };
  const { data: event } = await supabase
    .from("events")
    .select("title")
    .eq("slug", slug)
    .single();
  return {
    title: event ? `Table Clock - ${event.title}` : "Table Clock",
    robots: { index: false },
  };
}

export default async function TableClockPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("events")
    .select("id, slug, title, status")
    .eq("slug", slug)
    .single();

  if (error || !event || event.status !== "published") notFound();

  return <TableClock eventSlug={event.slug} eventTitle={event.title} />;
}
