export interface EventVitalityRow {
  id: string;
  starts_at: string;
  series_id: string | null;
  organizer_id: string | null;
  source_platform: string | null;
  organizers?: { name: string | null } | { name: string | null }[] | null;
}

export interface EventVitalityBreakdown {
  key: string;
  label: string;
  distinctChoices: number;
}

export interface EventVitalitySummary {
  occurrences: number;
  distinctChoices: number;
  recurringSeries: number;
  oneOffChoices: number;
  organizers: EventVitalityBreakdown[];
  sources: EventVitalityBreakdown[];
}

interface Choice {
  row: EventVitalityRow;
  isRecurring: boolean;
}

/**
 * Collapse materialized occurrences into the choices a visitor can actually
 * make. Every recurring series counts once; each standalone event counts once.
 */
export function summarizeEventVitality(
  rows: EventVitalityRow[]
): EventVitalitySummary {
  const choices = new Map<string, Choice>();
  // A canary proves the extraction chain, but it is synthetic inventory and
  // must never help satisfy the customer-facing supply promise.
  const visibleRows = rows.filter((row) => row.source_platform !== "canary");

  // Earliest occurrence is the representative for a recurring series. Sorting
  // here keeps organizer/source diagnostics deterministic if old data is
  // inconsistent across materialized occurrences.
  const chronologicalRows = [...visibleRows].sort((a, b) =>
    a.starts_at.localeCompare(b.starts_at)
  );

  for (const row of chronologicalRows) {
    const isRecurring = Boolean(row.series_id);
    const choiceKey = isRecurring ? `series:${row.series_id}` : `event:${row.id}`;
    if (!choices.has(choiceKey)) {
      choices.set(choiceKey, { row, isRecurring });
    }
  }

  const organizerCounts = new Map<string, { label: string; count: number }>();
  const sourceCounts = new Map<string, { label: string; count: number }>();
  let recurringSeries = 0;

  for (const choice of choices.values()) {
    if (choice.isRecurring) recurringSeries++;

    const organizer = Array.isArray(choice.row.organizers)
      ? choice.row.organizers[0]
      : choice.row.organizers;
    const organizerKey = choice.row.organizer_id ?? "unassigned";
    const organizerLabel = organizer?.name?.trim() || "Unassigned";
    incrementBreakdown(organizerCounts, organizerKey, organizerLabel);

    const source = choice.row.source_platform?.trim() || "manual";
    incrementBreakdown(sourceCounts, source, source);
  }

  return {
    occurrences: visibleRows.length,
    distinctChoices: choices.size,
    recurringSeries,
    oneOffChoices: choices.size - recurringSeries,
    organizers: sortedBreakdown(organizerCounts),
    sources: sortedBreakdown(sourceCounts),
  };
}

export function formatVitalityBreakdown(
  breakdown: EventVitalityBreakdown[],
  limit = 5
): string {
  if (breakdown.length === 0) return "none";

  const visible = breakdown
    .slice(0, limit)
    .map((item) => `${item.label} ${item.distinctChoices}`)
    .join(", ");
  const remaining = breakdown.length - limit;
  return remaining > 0 ? `${visible}, +${remaining} more` : visible;
}

export function buildVitalityFloorProblem(
  summary: EventVitalitySummary,
  floor: number
): string | null {
  if (summary.distinctChoices >= floor) return null;
  const choiceLabel = summary.distinctChoices === 1 ? "choice" : "choices";

  return (
    `Only ${summary.distinctChoices} distinct published event ${choiceLabel} in the next 14 days ` +
    `(${summary.occurrences} occurrences; floor: ${floor}). ` +
    `Sources: ${formatVitalityBreakdown(summary.sources)}. ` +
    `Organizers: ${formatVitalityBreakdown(summary.organizers)}.`
  );
}

function incrementBreakdown(
  counts: Map<string, { label: string; count: number }>,
  key: string,
  label: string
) {
  const current = counts.get(key);
  counts.set(key, {
    label,
    count: (current?.count ?? 0) + 1,
  });
}

function sortedBreakdown(
  counts: Map<string, { label: string; count: number }>
): EventVitalityBreakdown[] {
  return Array.from(counts, ([key, value]) => ({
    key,
    label: value.label,
    distinctChoices: value.count,
  })).sort(
    (a, b) =>
      b.distinctChoices - a.distinctChoices || a.label.localeCompare(b.label)
  );
}
