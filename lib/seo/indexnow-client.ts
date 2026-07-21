/**
 * Client-side helper: notify search engines that content changed.
 * Fire-and-forget — never blocks or breaks the calling flow.
 */
export function pingSearchEngines(paths: string[]): void {
  try {
    void fetch("/api/seo/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    }).catch((error) => console.error("[indexnow] client ping failed:", error));
  } catch (error) {
    console.error("[indexnow] client ping failed:", error);
  }
}
