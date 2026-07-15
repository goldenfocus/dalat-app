/**
 * Ops alerts to Yan's Telegram — NOT user-facing copy, so no i18n.
 *
 * Requires TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID env vars. When unset the
 * alert is dropped with a loud server log (never throws — an alert failure
 * must not break the pipeline it reports on).
 */
export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error(
      "[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set — alert dropped:",
      text
    );
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      console.error("[telegram] send failed:", res.status, await res.text());
    }
    return res.ok;
  } catch (e) {
    console.error("[telegram] send error:", e);
    return false;
  }
}
