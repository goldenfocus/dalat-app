import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  WHATSAPP_COMMUNITY_NAME,
  getWhatsAppCommunityUrl,
} from "@/lib/events/whatsapp-source";

/**
 * "via Life in Đà Lạt on WhatsApp" — credits the community only. Links the
 * public community invite when NEXT_PUBLIC_WHATSAPP_COMMUNITY_URL is set,
 * otherwise renders plain text.
 */
export async function WhatsAppSourceCredit({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "events" });
  const label = t("whatsappSourceCredit", { community: WHATSAPP_COMMUNITY_NAME });
  const href = getWhatsAppCommunityUrl();
  return (
    <footer className="border-t pt-4 text-sm text-muted-foreground">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
          className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 hover:text-foreground active:scale-95 transition-all">
          {label}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      ) : (
        <p className="py-2">{label}</p>
      )}
    </footer>
  );
}
