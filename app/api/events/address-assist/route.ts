import { NextResponse } from "next/server";
import { z } from "zod";
import { isCustomLocationCandidate } from "@/lib/geo/location-form-values";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const goldenFocusAddressEndpoint = "https://dalat-ai.goldenfoc.us/chat";
const requestBody = z.object({
  query: z.string().trim().min(4).max(160).refine(isCustomLocationCandidate),
});
const modelAnswer = z.object({ query: z.string().trim().min(4).max(200) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const input = requestBody.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  const token = process.env.DALAT_ADDRESS_AI_TOKEN;
  if (!token) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: quota, error } = await supabase.rpc("check_rate_limit", {
    p_action: "event_address_assist",
    p_limit: 12,
    p_window_ms: 60 * 60 * 1000,
  });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!quota?.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { query } = input.data;
  try {
    // Keep the request on the dedicated Golden Focus Mac mini's local model.
    const response = await fetch(goldenFocusAddressEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        system: [
          "Rewrite this address or place name as a map search phrase for an event near Da Lat, Vietnam.",
          "Restore Vietnamese accents, expand clear address abbreviations, and add Da Lat or Lam Dong if no place context is given.",
          "Keep all existing numbers in order and do not add new numbers, street names, venues, or coordinates.",
          'Do not claim that the place exists. Return only a JSON object with a single "query" string.',
        ].join(" "),
        prompt: JSON.stringify({ query }),
        json: true,
        temperature: 0,
        max_tokens: 120,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(21000),
    });
    if (!response.ok) return NextResponse.json({ error: "unavailable" }, { status: 503 });

    const answer = modelAnswer.safeParse(JSON.parse(await response.text()));
    const suggestion = answer.success ? answer.data.query : "";
    if (!isCustomLocationCandidate(suggestion) || !suggestion ||
        (query.match(/[0-9]+/g) ?? []).join(",") !== (suggestion.match(/[0-9]+/g) ?? []).join(",") ||
        suggestion.toLowerCase() === query.toLowerCase()) {
      return NextResponse.json({ suggestion: null });
    }
    return NextResponse.json({ suggestion });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
