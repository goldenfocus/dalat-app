/**
 * Source credit for events ingested from the Life in Đà Lạt WhatsApp
 * community (source_platform = "whatsapp"). The credit only ever names the
 * community and links its public invite URL — never the poster, their phone
 * number, or an individual sub-group.
 */
export const WHATSAPP_SOURCE_PLATFORM = "whatsapp";
export const WHATSAPP_COMMUNITY_NAME = "Life in Đà Lạt";

export function isWhatsAppSourced(sourcePlatform: string | null | undefined) {
  return sourcePlatform === WHATSAPP_SOURCE_PLATFORM;
}

/**
 * Returns the configured public community invite URL, or null when unset or
 * not a plain https://chat.whatsapp.com/<code> link.
 */
export function getWhatsAppCommunityUrl(
  raw: string | undefined = process.env.NEXT_PUBLIC_WHATSAPP_COMMUNITY_URL,
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "chat.whatsapp.com" ||
      url.username ||
      url.password ||
      !/^\/[A-Za-z0-9]{10,}\/?$/.test(url.pathname)
    ) {
      return null;
    }
    return `https://chat.whatsapp.com${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}
