import { placesKey } from "@/lib/venues/places";

/**
 * Serves a Google Place photo by its resource name without copying it into
 * our storage: we ask Places for a short-lived photoUri and redirect to it.
 * The API key never reaches the browser.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") || "";
  const width = Math.min(1600, Math.max(100, Number(url.searchParams.get("w")) || 800));
  if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(name))
    return new Response("Bad photo name", { status: 400 });
  const key = placesKey();
  if (!key) return new Response("Not configured", { status: 404 });
  const res = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${width}&skipHttpRedirect=true`,
    { headers: { "X-Goog-Api-Key": key }, signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } },
  );
  if (!res.ok) return new Response("Photo unavailable", { status: 404 });
  const { photoUri } = (await res.json()) as { photoUri?: string };
  if (!photoUri) return new Response("Photo unavailable", { status: 404 });
  return new Response(null, {
    status: 302,
    headers: { Location: photoUri, "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
