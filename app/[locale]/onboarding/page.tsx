import { safeReturnPath } from "@/lib/auth/continuation";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeReturnPath((await searchParams).next);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  // Check if user already has a username
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  if (profile?.username) {
    redirect(next);
  }

  // Get data from OAuth metadata if available
  const defaultDisplayName =
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    "";

  // Get avatar URL from OAuth provider (Google, etc.)
  const oauthAvatarUrl =
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture ||
    null;

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <OnboardingFlow
          redirectTo={next}
          userId={user.id}
          defaultDisplayName={defaultDisplayName}
          oauthAvatarUrl={oauthAvatarUrl}
        />
      </div>
    </main>
  );
}
