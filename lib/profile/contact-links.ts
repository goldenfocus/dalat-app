/** Build public chat/call hrefs from profile contact fields. Empty or junk values yield null so buttons stay hidden. */

export function zaloHref(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const fromUrl = raw.match(/^https?:\/\/(?:www\.)?zalo\.me\/(.+)$/i);
  if (fromUrl) return `https://zalo.me/${fromUrl[1].replace(/^\/+/, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Zalo personal links resolve with the domestic leading 0, not 84.
  let local = digits;
  if (local.startsWith("84") && local.length >= 11)
    local = `0${local.slice(2)}`;
  else if (!local.startsWith("0") && local.length === 9) local = `0${local}`;
  return `https://zalo.me/${local}`;
}

export function whatsappHref(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const fromUrl = raw.match(
    /^https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)(\+?\d+)/i,
  );
  if (fromUrl) return `https://wa.me/${fromUrl[1].replace(/\D/g, "")}`;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 10)
    digits = `84${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}

export function telegramHref(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const fromUrl = raw.match(
    /^https?:\/\/(?:www\.)?t(?:elegram)?\.me\/(@?[\w+]{3,})$/i,
  );
  if (fromUrl) return `https://t.me/${fromUrl[1].replace(/^@/, "")}`;
  const handle = raw.replace(/^@/, "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(handle)) return null;
  return `https://t.me/${handle}`;
}

export function telHref(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const number = raw.replace(/[^\d+]/g, "");
  if (number.replace(/\D/g, "").length < 8) return null;
  return `tel:${number}`;
}
