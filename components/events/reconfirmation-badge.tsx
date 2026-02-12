import { ClipboardCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";

interface ReconfirmationBadgeProps {
  eventId: string;
  eventSlug: string;
  totalGoing: number;
}

export async function ReconfirmationBadge({
  eventId,
  eventSlug,
  totalGoing,
}: ReconfirmationBadgeProps) {
  if (totalGoing === 0) return null;

  const supabase = await createClient();
  const t = await getTranslations("reconfirmation");

  const { count: confirmedCount } = await supabase
    .from("rsvps")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "going")
    .not("confirmed_at", "is", null);

  const confirmed = confirmedCount ?? 0;

  return (
    <Link
      href={`/events/${eventSlug}/reconfirmation`}
      className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 hover:bg-muted/50 transition-all active:scale-[0.98]"
    >
      <ClipboardCheck className="w-5 h-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {t("reconfirmBadge", { confirmed, total: totalGoing })}
        </p>
        <p className="text-xs text-muted-foreground">{t("reconfirmLink")}</p>
      </div>
      {/* Mini progress bar */}
      <div className="w-12 h-2 bg-muted rounded-full overflow-hidden shrink-0">
        <div
          className="h-full bg-green-500 rounded-full"
          style={{ width: `${totalGoing > 0 ? Math.round((confirmed / totalGoing) * 100) : 0}%` }}
        />
      </div>
    </Link>
  );
}
