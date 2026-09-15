import { createClient } from "@/lib/supabase/server";
import { venueCandidates } from "@/lib/experiences/venue-candidates";
export async function GET(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(
    {
      venues: await venueCandidates(
        new URL(request.url).searchParams.get("q") || "",
      ),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
