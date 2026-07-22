/**
 * Align an embedded lyric sheet (ID3 USLT — Suno et al. embed the real
 * lyrics) to Whisper segment timestamps.
 *
 * Whisper reliably hears WHEN vocals happen but mishears WHAT is sung on
 * music-heavy tracks (e.g. "Vortigaunt" for a sung hook). The sheet is the
 * ground truth for WHAT; Whisper provides the timing. Monotonic fuzzy
 * alignment anchors segments to sheet lines, then interpolates timestamps
 * for sheet lines Whisper missed.
 */

export interface WhisperSegment {
  start: number;
  end?: number;
  text: string;
}

export interface AlignedLine {
  time: number;
  text: string;
}

export interface SheetAlignment {
  lines: AlignedLine[];
  /** Sheet lines matched to real Whisper segments (not interpolated) */
  anchoredLines: number;
  sheetLineCount: number;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]/gu, "")
    .trim();
}

/** Sheet minus stage directions like "(Chorus)" / "[Café chatter]" and quote marks. */
export function sheetPlainLines(raw: string): string[] {
  const out: string[] = [];
  for (let line of raw.split("\n")) {
    line = line.trim().replace(/^"|"$/g, "").trim();
    if (!line || line.startsWith("(") || line.startsWith("[")) continue;
    out.push(line);
  }
  return out;
}

/** Dice coefficient over character bigrams — cheap fuzzy similarity. */
function similarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const ma = bigrams(a);
  const mb = bigrams(b);
  let overlap = 0;
  let total = 0;
  for (const [bg, count] of ma) {
    overlap += Math.min(count, mb.get(bg) ?? 0);
    total += count;
  }
  for (const count of mb.values()) total += count;
  return total === 0 ? 0 : (2 * overlap) / total;
}

/**
 * Returns timed lines covering the sheet plus anchor-coverage stats, or
 * empty lines when alignment fails (caller should fall back to Whisper's
 * own transcript + review). Callers must gate on coverage — interpolated
 * lines are fabricated timings, only trustworthy between dense anchors.
 */
export function alignSheetToSegments(
  sheetRaw: string,
  segments: WhisperSegment[],
  minRatio = 0.5
): SheetAlignment {
  const lines = sheetPlainLines(sheetRaw);
  const empty: SheetAlignment = {
    lines: [],
    anchoredLines: 0,
    sheetLineCount: lines.length,
  };
  if (lines.length === 0 || segments.length === 0) return empty;

  // Anchor whisper segments to sheet lines; cursor only moves forward so
  // repeated choruses map in order.
  const anchors: { t0: number; t1: number; a: number; b: number }[] = [];
  let cursor = 0;
  for (const seg of segments) {
    const segNorm = normalize(seg.text);
    if (!segNorm) continue;
    let bestRatio = 0;
    let bestSpan: [number, number] | null = null;
    // try skipping ahead up to 3 lines (whisper missed some) and consuming
    // 1..4 lines (whisper merges short lines into one segment)
    for (let skip = 0; skip < 4; skip++) {
      const start = cursor + skip;
      if (start >= lines.length) break;
      for (let take = 1; take <= 4 && start + take <= lines.length; take++) {
        const cand = normalize(lines.slice(start, start + take).join(" "));
        const r = similarity(segNorm, cand);
        if (r > bestRatio) {
          bestRatio = r;
          bestSpan = [start, start + take];
        }
      }
    }
    if (bestRatio >= minRatio && bestSpan) {
      anchors.push({
        t0: seg.start,
        t1: seg.end ?? seg.start,
        a: bestSpan[0],
        b: bestSpan[1],
      });
      cursor = bestSpan[1];
    }
  }
  if (anchors.length === 0) return empty;

  // Anchored lines spread across their segment's sung duration
  const timed = new Map<number, number>();
  for (const { t0, t1, a, b } of anchors) {
    const span = b - a;
    const dur = Math.max(t1 - t0, 0);
    for (let i = a; i < b; i++) {
      timed.set(i, t0 + (span > 1 ? (dur * (i - a)) / span : 0));
    }
  }

  // Interpolate unanchored lines between nearest anchored neighbors;
  // lines before the first / after the last anchor are dropped.
  const known = [...timed.keys()].sort((x, y) => x - y);
  for (let i = 0; i < lines.length; i++) {
    if (timed.has(i)) continue;
    const prev = known.filter((k) => k < i).pop();
    const next = known.find((k) => k > i);
    if (prev === undefined || next === undefined) continue;
    const frac = (i - prev) / (next - prev);
    timed.set(i, timed.get(prev)! + frac * (timed.get(next)! - timed.get(prev)!));
  }

  return {
    lines: [...timed.keys()]
      .sort((x, y) => x - y)
      .map((i) => ({ time: timed.get(i)!, text: lines[i] }))
      .sort((x, y) => x.time - y.time),
    anchoredLines: anchors.reduce((sum, { a, b }) => sum + (b - a), 0),
    sheetLineCount: lines.length,
  };
}

/** Build an LRC document from aligned lines. */
export function alignedToLrc(aligned: AlignedLine[], language: string): string {
  const out = [`[la:${language}]`, ""];
  for (const { time, text } of aligned) {
    // Round in total centiseconds so the carry propagates into seconds —
    // rounding the fraction alone can emit ".100", which LRC parsers read
    // as 100 MILLIseconds, yanking the line ~0.9s early and out of order.
    const total = Math.round(time * 100);
    const min = Math.floor(total / 6000);
    const sec = Math.floor((total % 6000) / 100);
    const cs = total % 100;
    out.push(
      `[${min.toString().padStart(2, "0")}:${sec
        .toString()
        .padStart(2, "0")}.${cs.toString().padStart(2, "0")}]${text}`
    );
  }
  return out.join("\n");
}
