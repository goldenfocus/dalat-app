import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { gradientFor } from "@/lib/tribes";
import { TribeChipJoinButton } from "./tribe-chip-join-button";

export type ChipTribe = {
  slug: string;
  name: string;
  cover_image_url: string | null;
  access_type?: string | null;
  settings?: { avatar_url?: string } | null;
};

/**
 * Compact "hosted by this tribe" chip. Used on the event page, moment detail
 * and album header — the read side of events.tribe_id, which has been written
 * since Jan 2026 and never displayed anywhere.
 *
 * Safe to render whenever tribe_id is set: an event with tribe_visibility
 * 'members_only' is already hidden from non-members by events_select_visible,
 * so anyone who can see the page may see which tribe hosts it.
 */
export async function TribeChip({
  tribe,
  showJoin = false,
}: {
  tribe: ChipTribe;
  showJoin?: boolean;
}) {
  const t = await getTranslations("tribes");
  const avatarUrl = tribe.cover_image_url ?? tribe.settings?.avatar_url ?? null;

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/tribes/${tribe.slug}`}
        className="group flex items-center gap-2.5 min-h-11 px-3 py-2 -ml-3 rounded-lg hover:bg-muted active:scale-[0.98] transition-all"
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={32}
            height={32}
            className="w-8 h-8 rounded-lg object-cover shrink-0"
          />
        ) : (
          <span
            className={`w-8 h-8 rounded-lg shrink-0 bg-gradient-to-br ${gradientFor(
              tribe.name
            )} flex items-center justify-center text-sm font-bold text-white/90`}
          >
            {tribe.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground leading-tight">
            {t("tribeLabel")}
          </span>
          <span className="block font-medium truncate group-hover:text-primary transition-colors leading-tight">
            {tribe.name}
          </span>
        </span>
      </Link>

      {showJoin && tribe.access_type === "public" && (
        <TribeChipJoinButton slug={tribe.slug} />
      )}
    </div>
  );
}
