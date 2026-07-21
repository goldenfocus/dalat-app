/**
 * IndexNow — instant indexing pings on content publish/update.
 *
 * One POST fans out to every participating engine: Bing (which feeds ChatGPT
 * retrieval), Naver (64% of Korean search — Korean tourists are a core Da Lat
 * audience), Yandex, Seznam. Google does not participate (it relies on
 * sitemap lastmod + crawl).
 *
 * The key is public by design — engines verify ownership by fetching
 * https://dalat.app/<key>.txt, which is committed in public/.
 */

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const HOST = "dalat.app";
const KEY = "afb32311eef4622de4d11c2587784c63";

/**
 * Ping IndexNow with site-relative paths (e.g. "/events/my-event").
 * Fire-and-forget semantics but failures log loudly — a dead integration
 * that fails silently is how pipelines rot.
 */
export async function pingIndexNow(paths: string[]): Promise<void> {
  const urlList = [...new Set(paths)]
    .filter((p) => p.startsWith("/"))
    .slice(0, 100)
    .map((p) => `https://${HOST}${p}`);

  if (urlList.length === 0) return;

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: `https://${HOST}/${KEY}.txt`,
        urlList,
      }),
    });

    // 200 = submitted, 202 = accepted (key validation pending)
    if (res.status !== 200 && res.status !== 202) {
      console.error(`[indexnow] ping failed: HTTP ${res.status} for ${urlList.length} URLs`);
    }
  } catch (error) {
    console.error("[indexnow] ping failed:", error);
  }
}
