export function hasLockedSchedule(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.schedule_locked === true;
}
