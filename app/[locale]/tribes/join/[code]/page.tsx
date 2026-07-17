import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { JoinByCodeForm } from "@/components/tribes/join-by-code-form";

interface PageProps { params: Promise<{ code: string; locale: string }>; }

export default async function JoinByCodePage({ params }: PageProps) {
  const { code, locale } = await params;
  const supabase = await createClient();
  const { data: tribes } = await supabase.rpc("get_tribe_by_code", { p_code: code });
  const tribe = tribes?.[0];

  if (!tribe) {
    const t = await getTranslations({ locale, namespace: "tribes" });
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t("invalidCodeTitle")}</h1>
          <p className="text-muted-foreground">{t("invalidCodeDescription")}</p>
        </div>
      </main>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: membership } = await supabase.from("tribe_members").select("id").eq("tribe_id", tribe.id).eq("user_id", user.id).single();
    if (membership) redirect(`/${locale}/tribes/${tribe.slug}`);
  }

  return <main className="min-h-screen flex items-center justify-center p-4"><JoinByCodeForm tribe={tribe} code={code} isAuthenticated={!!user} locale={locale} /></main>;
}
