/** Accept Vietnamese mobile numbers locally; other countries require an explicit +country code. */
export function normalizeLoginPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, "");
  if (/^0[35789]\d{8}$/.test(compact)) return "+84" + compact.slice(1);
  if (/^[35789]\d{8}$/.test(compact)) return "+84" + compact;
  if (/^84[35789]\d{8}$/.test(compact)) return "+" + compact;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) {
    // Do not accept a domestic trunk zero after Vietnam's country code.
    if (compact.startsWith("+84") && !/^\+84[35789]\d{8}$/.test(compact)) return null;
    return compact;
  }
  return null;
}
