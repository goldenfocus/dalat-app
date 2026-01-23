import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Redirect old settings URL to the consolidated edit page
export default async function EventSettingsPage({ params }: PageProps) {
  const { slug } = await params;
  redirect(`/events/${slug}/edit`);
}
