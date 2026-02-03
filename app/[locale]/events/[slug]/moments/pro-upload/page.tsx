import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Pro upload has been merged into the unified upload experience.
 * Redirect to the regular upload page which now supports all features.
 */
export default async function ProUploadRedirect({ params }: PageProps) {
  const { slug } = await params;
  redirect(`/events/${slug}/moments/new`);
}
