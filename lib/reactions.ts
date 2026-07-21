/**
 * Shared reaction vocabulary.
 *
 * The emoji set is a DB CHECK constraint (migration 20261013), so adding one
 * here without a migration will fail at write time with a constraint violation.
 */
export const REACTION_EMOJI = ["heart", "fire", "laugh", "wow", "pray"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export type ReactionTargetType = "moment" | "comment";

/** Glyph rendered in the UI. */
export const REACTION_GLYPH: Record<ReactionEmoji, string> = {
  heart: "❤️",
  fire: "🔥",
  laugh: "😂",
  wow: "😮",
  pray: "🙏",
};

/**
 * i18n keys, written out literally rather than built as `reactions.${emoji}`.
 * scripts/check-client-namespaces.mjs fails the build on dynamic keys when the
 * useTranslations() binding is bare, and a literal map is cheaper than relying
 * on that subtlety holding.
 */
export const REACTION_LABEL_KEY: Record<ReactionEmoji, string> = {
  heart: "heart",
  fire: "fire",
  laugh: "laugh",
  wow: "wow",
  pray: "pray",
};

/** count + whether the current viewer has reacted, per emoji. */
export type ReactionCounts = Partial<Record<ReactionEmoji, { count: number; reacted: boolean }>>;

/** Total across all emoji — used for compact summaries. */
export function totalReactions(counts: ReactionCounts): number {
  return Object.values(counts).reduce((sum, c) => sum + (c?.count ?? 0), 0);
}
