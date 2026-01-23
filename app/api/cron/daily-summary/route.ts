import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  DAILY_SUMMARY_SYSTEM,
  buildDailySummaryPrompt,
  type DailySummaryOutput,
} from "@/lib/blog/daily-summary-prompt";

// Lazy init - created on first request, not at build time
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  // Verify cron secret (MANDATORY - Vercel sends this in Authorization header)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[daily-summary] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.log("[daily-summary] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch commits from last 24h via GitHub API
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().split("T")[0];

    console.log(`[daily-summary] Fetching commits since ${since}`);

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      console.error("[daily-summary] GITHUB_TOKEN not configured");
      return NextResponse.json({ error: "GitHub token not configured" }, { status: 500 });
    }

    // Get repo info from env or default
    const repo = process.env.GITHUB_REPO || "goldenfocus/dalat-app";

    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits?since=${since}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[daily-summary] GitHub API error:", errorText);
      return NextResponse.json({ error: "GitHub API error" }, { status: 500 });
    }

    const commits = await res.json();

    if (!Array.isArray(commits) || commits.length === 0) {
      console.log("[daily-summary] No commits in the last 24 hours");
      return NextResponse.json({ message: "No commits today", skipped: true });
    }

    console.log(`[daily-summary] Found ${commits.length} commits`);

    // 2. Generate summary with AI
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: DAILY_SUMMARY_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildDailySummaryPrompt(
            commits.map((c: { commit: { message: string; author: { name: string } }; sha: string }) => ({
              message: c.commit.message.split("\n")[0], // First line only
              author: c.commit.author.name,
              sha: c.sha,
            })),
            today
          ),
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      console.error("[daily-summary] No text response from Claude");
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Parse JSON response
    let jsonText = textContent.text.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);

    const summary = JSON.parse(jsonText.trim()) as DailySummaryOutput;

    console.log("[daily-summary] Generated summary:", {
      title: summary.title,
      areas: summary.areas_changed,
      hasNarrative: summary.has_meaningful_narrative,
    });

    // 3. Get changelog category ID
    const supabase = getSupabase();
    const { data: category } = await supabase
      .from("blog_categories")
      .select("id")
      .eq("slug", "changelog")
      .single();

    // 4. Check if a summary for today already exists
    const { data: existingPost } = await supabase
      .from("blog_posts")
      .select("id")
      .eq("summary_date", today)
      .eq("source", "daily_summary")
      .single();

    if (existingPost) {
      console.log("[daily-summary] Summary already exists for today, updating...");

      // Update existing post
      const { error: updateError } = await supabase
        .from("blog_posts")
        .update({
          title: summary.title,
          story_content: summary.story_content || "",
          technical_content: summary.technical_content,
          areas_changed: summary.areas_changed,
          meta_description: summary.one_line_summary,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPost.id);

      if (updateError) {
        console.error("[daily-summary] Update error:", updateError);
        return NextResponse.json({ error: "Failed to update summary" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        updated: true,
        post_id: existingPost.id,
        has_narrative: summary.has_meaningful_narrative,
      });
    }

    // 5. Create new post
    const slug = `daily-update-${today}`;
    const finalStatus = summary.suggested_status || "draft";

    const { data: post, error: insertError } = await supabase
      .from("blog_posts")
      .insert({
        title: summary.title,
        slug,
        story_content: summary.story_content || "",
        technical_content: summary.technical_content,
        source: "daily_summary",
        status: finalStatus,
        // IMPORTANT: Set published_at when status is published, otherwise it stays NULL
        // and the post gets sorted to the end due to ORDER BY published_at DESC NULLS LAST
        published_at: finalStatus === "published" ? new Date().toISOString() : null,
        category_id: category?.id,
        summary_date: today,
        areas_changed: summary.areas_changed,
        seo_keywords: [],
        meta_description: summary.one_line_summary,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[daily-summary] Insert error:", insertError);
      return NextResponse.json({ error: "Failed to create summary" }, { status: 500 });
    }

    console.log("[daily-summary] Created draft post:", post.id);

    return NextResponse.json({
      success: true,
      post_id: post.id,
      has_narrative: summary.has_meaningful_narrative,
      areas_changed: summary.areas_changed,
    });
  } catch (err) {
    console.error("[daily-summary] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
