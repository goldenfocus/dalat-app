/**
 * Return the earliest visible occurrence for each real event choice. Recurring
 * series are one choice, while standalone events remain independent.
 */
export function takeDistinctEventChoices<
  T extends { id: string; series_id: string | null; starts_at: string },
>(events: T[], limit: number): T[] {
  const choices = new Map<string, T>();
  const chronological = [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  for (const event of chronological) {
    const key = event.series_id ? `series:${event.series_id}` : `event:${event.id}`;
    if (!choices.has(key)) choices.set(key, event);
    if (choices.size === limit) break;
  }

  return Array.from(choices.values());
}
