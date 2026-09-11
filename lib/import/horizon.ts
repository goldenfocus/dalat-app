/** Activity Graph / scout discovery horizon — exact future start within 45 days. */
export const DISCOVERY_HORIZON_DAYS = 45;

/** Allow events that started a few hours ago (timezone / late ingest). */
export const PAST_GRACE_MS = 6 * 60 * 60 * 1000;

export type HorizonRejection = {
  ok: false;
  code: "past_event" | "beyond_horizon";
  startsAt: string;
};

export type HorizonDecision = { ok: true } | HorizonRejection;

export function evaluateDiscoveryHorizon(
  startsAt: Date,
  now: Date = new Date(),
): HorizonDecision {
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, code: "past_event", startsAt: "" };
  }
  if (startsAt.getTime() < now.getTime() - PAST_GRACE_MS) {
    return { ok: false, code: "past_event", startsAt: startsAt.toISOString() };
  }
  const horizonMs = DISCOVERY_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  if (startsAt.getTime() > now.getTime() + horizonMs) {
    return { ok: false, code: "beyond_horizon", startsAt: startsAt.toISOString() };
  }
  return { ok: true };
}
