import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import type { GitHubReleaseWebhookPayload } from "@/lib/types/blog";
import {
  generateBlogContent,
  detectCategoryFromTitle,
} from "@/lib/blog/content-generator";
import { generateCoverFromDescriptions } from "@/lib/blog/cover-generator";

// Webhook processing can take time (AI generation + image upload)
export const maxDuration = 120;

/**
 * Verify GitHub webhook signature (HMAC-SHA256)
 */
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Extract version from tag name (e.g., "v1.2.3" -> "1.2.3")
 */
function extractVersion(tagName: string): string | null {
  const match = tagName.match(/^v?(\d+\.\d+\.\d+(?:-[\w.]+)?)$/);
  return match ? match[1] : null;
}

export async function POST(request: Request) {
  try {
    // Get the raw body for signature verification
    const payload = await request.text();

    // Verify webhook signature
    const signature = request.headers.get("x-hub-signature-256");
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!secret) {
      console.error("[github-webhook] GITHUB_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 503 }
      );
    }

    if (!signature || !verifySignature(payload, signature, secret)) {
      console.error("[github-webhook] Invalid signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Parse the payload
    const event = JSON.parse(payload) as GitHubReleaseWebhookPayload;

    // Only process published releases
    if (event.action !== "published" && event.action !== "released") {
      console.log(`[github-webhook] Ignoring action: ${event.action}`);
      return NextResponse.json({ status: "ignored", action: event.action });
    }

    const release = event.release;

    // Skip draft and prerelease
    if (release.draft || release.prerelease) {
      console.log("[github-webhook] Skipping draft/prerelease");
      return NextResponse.json({ status: "ignored", reason: "draft or prerelease" });
    }

    console.log(
      `[github-webhook] Processing release: ${release.name || release.tag_name}`
    );

    // Check if we already processed this release
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existingPost } = await supabase
      .from("blog_posts")
      .select("id")
      .eq("github_release_id", release.id)
      .single();

    if (existingPost) {
      console.log("[github-webhook] Release already processed:", release.id);
      return NextResponse.json({
        status: "skipped",
        reason: "already processed",
        post_id: existingPost.id,
      });
    }

    // Detect category from title
    const title = release.name || release.tag_name;
    const categorySlug = detectCategoryFromTitle(title);

    // Get category ID
    const { data: category } = await supabase
      .from("blog_categories")
      .select("id")
      .eq("slug", categorySlug)
      .single();

    // Generate AI content
    console.log("[github-webhook] Generating AI content...");
    const content = await generateBlogContent({
      title,
      body: release.body || "",
      category: categorySlug,
      version: extractVersion(release.tag_name) || undefined,
    });

    // Generate cover image from AI suggestions
    console.log("[github-webhook] Generating cover image...");
    const coverImageUrl = await generateCoverFromDescriptions(
      content.suggested_slug,
      content.suggested_image_descriptions
    );

    // Create the blog post
    const { data: post, error: insertError } = await supabase
      .from("blog_posts")
      .insert({
        source: "github_release",
        github_release_id: release.id,
        version: extractVersion(release.tag_name),
        category_id: category?.id,
        title: title
          .replace(/^(feat|fix|refactor|docs|chore|style|test|perf|ci|build):\s*/i, "")
          .trim(),
        story_content: content.story_content,
        cover_image_url: coverImageUrl,
        suggested_cta_url: content.suggested_cta_url,
        suggested_cta_text: content.suggested_cta_text,
        technical_content: content.technical_content,
        seo_keywords: content.seo_keywords,
        related_feature_slugs: content.related_features,
        slug: content.suggested_slug,
        meta_description: content.meta_description,
        social_share_text: content.social_share_text,
        status: "published",
        published_at: release.published_at,
      })
      .select("id, slug")
      .single();

    if (insertError) {
      console.error("[github-webhook] Insert error:", insertError);
      throw new Error(`Failed to create blog post: ${insertError.message}`);
    }

    console.log(`[github-webhook] Created post: ${post.slug}`);

    return NextResponse.json({
      status: "created",
      post_id: post.id,
      slug: post.slug,
    });
  } catch (error) {
    console.error("[github-webhook] Error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "github-release-webhook",
    configured: !!process.env.GITHUB_WEBHOOK_SECRET,
  });
}
