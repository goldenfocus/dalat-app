import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { StartExperience } from "@/components/experiences/start";
export const metadata = { robots: { index: false, follow: false } };
export default async function NewExperience() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const t = await getTranslations("experiences");
  return (
    <main className="mx-auto max-w-xl px-5 py-16 space-y-6">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Đà Lạt · {t("personalJournal")}
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">{t("create")}</h1>
      <p className="text-lg text-muted-foreground">{t("promise")}</p>
      <p className="rounded-2xl bg-muted p-5 text-sm">{t("privateNotice")}</p>
      {user ? (
        <StartExperience
          label={t("newExperience")}
          errorLabel={t("recovery")}
        />
      ) : (
        <Link
          href="/auth/login?redirect=/experiences/new"
          className="block rounded-xl bg-primary px-5 py-4 text-center text-primary-foreground"
        >
          {t("signIn")}
        </Link>
      )}
    </main>
  );
}
