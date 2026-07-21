import { NextResponse } from "next/server";
import { sendTelegram } from "@/lib/alerts/telegram";

/**
 * CRON_SECRET-gated Telegram relay for trusted off-server workers (the Mac
 * mini's drain/caption loops), which hold CRON_SECRET but not the Telegram
 * credentials. POST { message } -> forwards to the ops Telegram chat.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const message = String((body as { message?: unknown }).message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  await sendTelegram(message.slice(0, 2000));
  return NextResponse.json({ ok: true });
}
