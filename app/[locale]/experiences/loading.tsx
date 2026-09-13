import { getTranslations } from "next-intl/server";

export default async function LoadingExperiences() {
  const t = await getTranslations("experiences");
  return (
    <div
      className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10"
      role="status"
      aria-busy="true"
    >
      <p className="text-sm font-medium text-muted-foreground">
        {t("loading")}
      </p>
      <div className="h-10 w-3/4 rounded-xl bg-muted" />
      <div className="h-20 rounded-2xl bg-muted" />
      <div className="h-36 rounded-2xl border border-dashed border-border bg-muted/40" />
    </div>
  );
}
