import type { ExtractedActivity } from "./types";

const LAM_VIEN_SQUARE = /(?:quang truong|square)\s+lam\s*vien|lam\s*vien\s+(?:square|quang\s*truong)/i;

function plain(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLocaleLowerCase("vi");
}

export function isLamVienSquareActivity(
  activity: Pick<ExtractedActivity, "locationName" | "address">,
): boolean {
  return LAM_VIEN_SQUARE.test(
    `${plain(activity.locationName)} ${plain(activity.address)}`,
  );
}

/** A carefully scoped date-known/time-TBD policy for official Lam Viên notices. */
export function isLamVienTbdActivity(
  activity: Pick<ExtractedActivity, "timePrecision" | "locationName" | "address">,
): boolean {
  return activity.timePrecision === "tba" && isLamVienSquareActivity(activity);
}

export function hasLamVienTbdSchedule(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.schedule_policy === "lam_vien_date_known_time_tbd";
}
