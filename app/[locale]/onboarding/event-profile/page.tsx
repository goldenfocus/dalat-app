import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { EventProfileForm } from "@/components/onboarding/event-profile-form";
import { localizedPath, safeReturnPath } from "@/lib/auth/continuation";
import { hasEventProfile, publicEventName } from "@/lib/auth/event-profile";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}

export default async function EventProfilePage({ params, searchParams }: PageProps) {
  const [{ locale }, { next }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const destination = safeReturnPath(next);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    const returnTo = localizedPath("/onboarding/event-profile?" + new URLSearchParams({ next: destination }), locale);
    redirect(localizedPath("/auth/login?" + new URLSearchParams({ next: returnTo }), locale));
  }

  const { data: profile, error } = await supabase.from("profiles")
    .select("display_name, username")
    .eq("id", user.id)
    .single();
  if (error) throw new Error("Could not load the event profile");
  if (hasEventProfile(profile)) redirect(destination);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <EventProfileForm
        userId={user.id}
        displayName={publicEventName(profile.display_name) ?? ""}
        username={publicEventName(profile.username) ?? ""}
        destination={destination}
      />
    </main>
  );
}
