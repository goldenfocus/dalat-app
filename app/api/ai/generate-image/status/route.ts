import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Poll the status of an image generation job.
 * RLS restricts the lookup to the requesting user's own jobs.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }

  const { data: job, error } = await supabase
    .from("image_jobs")
    .select("status, result_url, error")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: job.status,
    imageUrl: job.result_url ?? undefined,
    error: job.status === "failed" ? job.error ?? "Generation failed" : undefined,
  });
}
