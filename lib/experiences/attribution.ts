// Resolve only the known creator. Never invent a profile from generated text.
export function attributionParts(text: string, username?: string | null) {
  if (!username) return [{ text, linked: false }];
  const handle = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(\\bthe reviewer\\b|\\bthe contributor\\b|người đánh giá|người đóng góp|\\ble contributeur\\b|@${handle}(?![\\w.-]))`,
    "gi",
  );
  return text
    .split(pattern)
    .map((part, index) => ({
      text: index % 2 ? `@${username}` : part,
      linked: index % 2 === 1,
    }));
}
export function attributedPlainText(text: string, username?: string | null) {
  return attributionParts(text, username)
    .map((p) => p.text)
    .join("");
}
