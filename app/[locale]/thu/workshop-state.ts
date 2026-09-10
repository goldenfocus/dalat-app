export const STORAGE_KEY = "dalat.thu.workshop.v1";
export interface Meeting {
  roles: Record<number, number>;
  level: number | null;
  experiment: string;
  owner: string;
  deadline: string;
  success: string;
  involvement: string;
  checkin: string;
  rights: string;
}
export function emptyMeeting(): Meeting {
  return {
    roles: {},
    level: null,
    experiment: "",
    owner: "",
    deadline: "",
    success: "",
    involvement: "",
    checkin: "",
    rights: "",
  };
}
/** Stored data is untrusted, versioned, bounded, and shared between EN/VI routes. */
export function readMeeting(raw: string | null): Meeting {
  const result = emptyMeeting();
  if (!raw) return result;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") return result;
    for (const key of [
      "experiment",
      "owner",
      "deadline",
      "success",
      "involvement",
      "checkin",
      "rights",
    ] as const) {
      if (typeof value[key] === "string")
        result[key] = value[key].slice(0, 3000);
    }
    if (!["", "Thu", "Zan"].includes(result.owner)) result.owner = "";
    if (Number.isInteger(value.level) && value.level >= 0 && value.level <= 5)
      result.level = value.level;
    if (value.roles && typeof value.roles === "object") {
      for (let i = 0; i < 15; i++) {
        const choice = value.roles[i];
        if (Number.isInteger(choice) && choice >= 0 && choice <= 2)
          result.roles[i] = choice;
      }
    }
  } catch {
    /* A damaged or older record must not prevent opening the meeting. */
  }
  return result;
}
