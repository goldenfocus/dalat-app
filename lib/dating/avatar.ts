/** No user-controlled third-party image requests from private dating cards. */
export function safeDatingAvatar(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    return u.hostname === "cdn.dalat.app" ||
      (u.hostname === "aljcmodwjqlznzcydyor.supabase.co" &&
        u.pathname.startsWith("/storage/v1/object/public/avatars/"))
      ? u.href
      : null;
  } catch {
    return null;
  }
}
