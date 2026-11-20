export type RentalSlot = { id: string; starts_at: string };

export async function readRentalSlots<Slot extends RentalSlot = RentalSlot>(
  query: (from: number, to: number) => PromiseLike<{ data: Slot[] | null; error: unknown }>,
) {
  const pageSize = 500;
  const slots: Slot[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query(offset, offset + pageSize - 1);
    if (error || !data) return null;
    slots.push(...data);
    if (data.length < pageSize) return slots;
  }
}
