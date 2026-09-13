// Safari probes audio with byte ranges; preserve authorization before calling this.
export function mediaResponse(
  data: Blob,
  mime: string,
  range: string | null,
  attachment = false,
) {
  const headers = new Headers({
    "Content-Type": mime,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  });
  if (attachment) headers.set("Content-Disposition", "attachment");
  if (!range) {
    headers.set("Content-Length", String(data.size));
    return new Response(data, { headers });
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const invalid = () =>
    new Response(null, {
      status: 416,
      headers: {
        ...Object.fromEntries(headers),
        "Content-Range": `bytes */${data.size}`,
      },
    });
  if (!match || (!match[1] && !match[2])) return invalid();
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, data.size - Number(match[2]));
  const end =
    match[1] && match[2]
      ? Math.min(Number(match[2]), data.size - 1)
      : data.size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= data.size
  )
    return invalid();
  headers.set("Content-Range", `bytes ${start}-${end}/${data.size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(data.slice(start, end + 1), { status: 206, headers });
}
