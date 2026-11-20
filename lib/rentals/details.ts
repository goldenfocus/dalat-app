import { z } from "zod";

export const amenityKeys = ["wifi", "pool"] as const;
export const areaKeys = ["central", "quiet"] as const;
export const utilityKeys = ["cleaning", "electricity", "water"] as const;
export const ruleKeys = ["dogs", "parties"] as const;
export const roomKeys = ["bedrooms", "bathrooms", "livingRooms", "studies"] as const;
const textDetailGroups = ["amenities", "area", "nearby", "rules"] as const;
export const detailGroups = [...textDetailGroups, "rooms"] as const;
export const roomLabelLength = 100;
const roomCount = z.number().int().min(0).max(999);
const inclusion = z.enum(["included", "notIncluded"]);
const permission = z.enum(["allowed", "notAllowed"]);
const customDetail = z.discriminatedUnion("group", [
  z.object({
    group: z.enum(textDetailGroups),
    label: z.string().trim().min(1).max(1000),
    pricing: z.union([inclusion, z.number().int().positive().max(10_000_000_000)]).optional(),
  }),
  z.object({
    group: z.literal("rooms"),
    label: z.string().trim().min(1).max(roomLabelLength),
    count: roomCount.min(1),
  }),
]);

export const detailsSchema = z.object({
  amenities: z.array(z.enum(amenityKeys)).max(2).default([]),
  area: z.array(z.enum(areaKeys)).max(2).default([]),
  utilities: z.partialRecord(z.enum(utilityKeys), inclusion).default({}),
  rules: z.partialRecord(z.enum(ruleKeys), permission).default({}),
  minimumChildAge: z.number().int().min(1).max(18).optional(),
  rooms: z.partialRecord(z.enum(roomKeys), roomCount).default({}),
  custom: z.array(customDetail).max(150).default([]),
});
export type RentalDetails = z.infer<typeof detailsSchema>;

export function rentalDetails(value: unknown) {
  return detailsSchema.safeParse(value).data ?? detailsSchema.parse({});
}

export function rentalDetailTranslations(value: string | undefined, count: number): string[] {
  if (!value) return [];
  try {
    const translated: unknown = JSON.parse(value);
    return Array.isArray(translated) && translated.length === count &&
      translated.every(label => typeof label === "string" && label.trim()) ? translated : [];
  } catch {
    return [];
  }
}

function readRoomCount(value: FormDataEntryValue | null | undefined) {
  return typeof value === "string" && /^[0-9]{1,3}$/.test(value) ? Number(value) : NaN;
}

export function readRentalDetails(form: FormData) {
  const groupValues = (key: string, keys: readonly string[]) =>
    Object.fromEntries(keys.flatMap(name => {
      const value = form.get(key + "." + name);
      return value ? [[name, value]] : [];
    }));
  const rooms = Object.fromEntries(roomKeys.flatMap(key => {
    const value = form.get("rooms." + key);
    return value === null || value === "" ? [] : [[key, readRoomCount(value)]];
  }));
  const customRooms = form.getAll("rooms.count");
  const custom = detailGroups.flatMap(group => {
    const pricing = form.getAll(group + ".pricing");
    const amounts = form.getAll(group + ".amount");
    return form.getAll(group + ".label").flatMap<unknown>((label, index) => {
      if (typeof label !== "string" || !label.trim()) return [];
      if (group === "rooms") return [{ group, label, count: readRoomCount(customRooms[index]) }];
      return [{ group, label, pricing: pricing[index] === "paid" ?
        Number(amounts[index]) : pricing[index] || undefined }];
    });
  });
  return detailsSchema.safeParse({
    amenities: form.getAll("amenities"), area: form.getAll("area"),
    utilities: groupValues("utility", utilityKeys), rules: groupValues("rule", ruleKeys),
    minimumChildAge: form.get("minimumChildAge") ? Number(form.get("minimumChildAge")) : undefined,
    rooms,
    custom,
  });
}
