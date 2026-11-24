export type EventProfile = {
  display_name: string | null;
  username: string | null;
};

export const EVENT_PROFILE_REQUIRED = "event_profile_required";

export function publicEventName(value: string | null | undefined) {
  const name = value?.trim();
  return name && name.toLowerCase() !== "anonymous" ? name : null;
}

export function hasEventProfile(profile: EventProfile | null) {
  return !!publicEventName(profile?.display_name) && !!publicEventName(profile?.username);
}

export function isEventUsername(username: string) {
  return username.length >= 3 && username.length <= 20 &&
    /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(username) && !/[._-]{2}/.test(username);
}
