import { createClient } from "@/lib/supabase/server";

/**
 * Award loyalty points to a user for completing an activity.
 *
 * This is a fire-and-forget helper — errors are logged but never thrown.
 * The underlying RPC is idempotent: calling it twice with the same
 * reference_id + activity_type won't double-award.
 *
 * @returns The number of points awarded (0 if already awarded or on error)
 */
export async function awardPoints(
  userId: string,
  activityType: string,
  options?: {
    points?: number;
    referenceId?: string;
    referenceType?: string;
  }
): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("award_loyalty_points", {
      p_user_id: userId,
      p_activity_type: activityType,
      p_points: options?.points ?? null,
      p_reference_id: options?.referenceId ?? null,
      p_reference_type: options?.referenceType ?? null,
    });

    if (error) {
      console.error("[Loyalty] Failed to award points:", error);
      return 0;
    }
    return data ?? 0;
  } catch (err) {
    console.error("[Loyalty] Unexpected error awarding points:", err);
    return 0;
  }
}
