import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function ActivitySourceFooter({ locale, sourceMetadata, lastConfirmedAt }: {
  locale: string;
  sourceMetadata: Record<string, unknown> | null;
  lastConfirmedAt: string | null;
}) {
  const raw = sourceMetadata?.source_url;
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
  } catch { return null; }
  const t = await getTranslations({ locale, namespace: "events" });
  const confirmed = lastConfirmedAt ? new Date(lastConfirmedAt) : null;
  return (
    <footer className="border-t pt-4 text-sm text-muted-foreground">
      <a href={url.toString()} target="_blank" rel="noopener noreferrer"
        className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 hover:text-foreground active:scale-95 transition-all">
        {t("activitySource")}: {url.hostname.replace(/^www\./, "")}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
      {confirmed && !Number.isNaN(confirmed.getTime()) && (
        <p>{t("activityLastConfirmed")}: <time dateTime={lastConfirmedAt!}>
          {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(confirmed)}
        </time></p>
      )}
    </footer>
  );
}
