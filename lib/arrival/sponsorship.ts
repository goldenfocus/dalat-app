/** Eligibility depends on registration time, never the time of arrival/redemption. */
export function withinRegistrationCutoff(registeredAt: string | null | undefined, cutoffAt: string | null | undefined): boolean {
  if (!cutoffAt) return true;
  const registered = registeredAt ? Date.parse(registeredAt) : NaN;
  const cutoff = Date.parse(cutoffAt);
  return Number.isFinite(registered) && Number.isFinite(cutoff) && registered < cutoff;
}
