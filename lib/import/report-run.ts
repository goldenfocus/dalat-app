import { SupabaseClient } from "@supabase/supabase-js";
import { sendTelegram } from "@/lib/alerts/telegram";
import { IMPORT_STATUS } from "./import-config";
import { recordImportRun, isRepeatZero } from "./run-log";
import type { ProcessResult } from "./utils";

/**
 * Record + report one import run: heartbeat row, then a one-line Telegram
 * digest. Errors and repeat-zero runs are 🚨; productive runs get a 📥 line.
 * Quiet single runs (0 raw, first time) stay silent — that can be a real
 * quiet day; twice in a row cannot.
 */
export async function reportImportRun(
  supabase: SupabaseClient,
  source: string,
  startedAt: Date,
  rawSeen: number,
  result: ProcessResult
): Promise<void> {
  const repeatZero = await isRepeatZero(supabase, source, rawSeen);
  await recordImportRun(supabase, source, startedAt, rawSeen, result);

  const line = `${source}: ${rawSeen} raw · ${result.processed} imported (${IMPORT_STATUS}) · ${result.skipped} skipped · ${result.errors} errors`;

  if (result.errors > 0 || repeatZero) {
    await sendTelegram(
      `🚨 <b>Import problem</b>\n${line}` +
        (repeatZero
          ? "\n(second consecutive zero-raw run — source may be dead)"
          : "") +
        (result.details.length > 0
          ? `\n${result.details.slice(0, 3).join("\n")}`
          : "")
    );
  } else if (result.processed > 0) {
    await sendTelegram(
      `📥 ${line}\nReview: https://dalat.app/admin/import`
    );
  }
}
