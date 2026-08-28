/* eslint-disable no-console -- This is an operator-facing CLI. */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { validateGuideForPublishing } from "../lib/blog/guide-quality";

config({ path: resolve(process.cwd(), ".env.local") });

type CuratedGuide = {
  slug: string;
  title: string;
  storyContent: string;
  technicalContent: string;
  publishedAt: string;
  metaDescription: string;
  seoKeywords: readonly string[];
  suggestedCtaUrl: string | null;
  suggestedCtaText: string | null;
  sourceUrls: readonly {
    url: string;
    title: string;
    publisher: string;
    published_at: string | null;
  }[];
  duplicateSlugsToArchive?: readonly string[];
};

function sourceUrlsMatch(
  actual: unknown,
  expected: CuratedGuide["sourceUrls"]
): boolean {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;

  return expected.every((source, index) => {
    const candidate = actual[index];
    return (
      typeof candidate === "object" &&
      candidate !== null &&
      "url" in candidate &&
      "title" in candidate &&
      "publisher" in candidate &&
      "published_at" in candidate &&
      candidate.url === source.url &&
      candidate.title === source.title &&
      candidate.publisher === source.publisher &&
      candidate.published_at === source.published_at
    );
  });
}

async function main() {
  const modulePath = process.argv.slice(2).find((argument) => argument.endsWith(".ts"));
  const shouldApply = process.argv.includes("--apply");

  if (!modulePath) {
    throw new Error(
      "Usage: npx tsx scripts/publish-curated-guide.ts scripts/curated-guides/<guide>.ts [--apply]"
    );
  }

  const absoluteModulePath = resolve(process.cwd(), modulePath);
  const loaded = (await import(pathToFileURL(absoluteModulePath).href)) as {
    curatedGuide?: CuratedGuide;
  };
  const guide = loaded.curatedGuide;

  if (!guide) {
    throw new Error(`${modulePath} must export curatedGuide`);
  }

  const qualityIssues = validateGuideForPublishing({
    title: guide.title,
    storyContent: guide.storyContent,
  });

  if (qualityIssues.length > 0) {
    throw new Error(
      `Guide quality checks failed:\n${qualityIssues
        .map((issue) => `- ${issue.message}`)
        .join("\n")}`
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: existing, error: fetchError } = await supabase
    .from("blog_posts")
    .select("id, title, status, story_content, technical_content, meta_description")
    .eq("slug", guide.slug)
    .single();

  if (fetchError || !existing) {
    throw new Error(`Could not load ${guide.slug}: ${fetchError?.message || "not found"}`);
  }

  const duplicateSlugs = [...(guide.duplicateSlugsToArchive || [])];
  console.log(`${shouldApply ? "APPLY" : "CHECK"}: ${guide.slug}`);
  console.log(`  ${existing.title} -> ${guide.title}`);
  console.log(`  public words: ${guide.storyContent.trim().split(/\s+/u).length}`);
  console.log(`  duplicate guides to archive: ${duplicateSlugs.length}`);

  if (!shouldApply) {
    console.log("Quality checks pass. Re-run with --apply to update production.");
    return;
  }

  const translatableFields = [
    "title",
    "story_content",
    "technical_content",
    "meta_description",
  ];
  const { error: protectedError, count: protectedCount } = await supabase
    .from("content_translations")
    .select("id", { count: "exact", head: true })
    .eq("content_type", "blog")
    .eq("content_id", existing.id)
    .in("field_name", translatableFields)
    .in("translation_status", ["reviewed", "edited"]);

  if (protectedError) {
    throw new Error(`Could not inspect existing translations: ${protectedError.message}`);
  }
  if ((protectedCount || 0) > 0) {
    throw new Error(
      "Production update stopped: this guide has reviewed or edited translations that require manual handling."
    );
  }

  const { error: updateError } = await supabase
    .from("blog_posts")
    .update({
      title: guide.title,
      story_content: guide.storyContent,
      technical_content: guide.technicalContent,
      meta_description: guide.metaDescription,
      seo_keywords: [...guide.seoKeywords],
      source_urls: [...guide.sourceUrls],
      suggested_cta_url: guide.suggestedCtaUrl,
      suggested_cta_text: guide.suggestedCtaText,
      status: "published",
      published_at: guide.publishedAt,
      source_locale: "en",
    })
    .eq("id", existing.id);

  if (updateError) {
    throw new Error(`Guide update failed: ${updateError.message}`);
  }

  const { error: translationError } = await supabase
    .from("content_translations")
    .delete()
    .eq("content_type", "blog")
    .eq("content_id", existing.id)
    .in("field_name", translatableFields)
    .eq("translation_status", "auto");

  if (translationError) {
    throw new Error(
      `Guide updated, but stale translations could not be cleared: ${translationError.message}`
    );
  }

  if (duplicateSlugs.length > 0) {
    const { error: archiveError } = await supabase
      .from("blog_posts")
      .update({ status: "archived" })
      .in("slug", duplicateSlugs);

    if (archiveError) {
      throw new Error(`Guide updated, but duplicate archive failed: ${archiveError.message}`);
    }
  }

  const { data: verified, error: verifyError } = await supabase
    .from("blog_posts")
    .select("title, status, story_content, technical_content, source_urls, published_at")
    .eq("id", existing.id)
    .single();

  if (
    verifyError ||
    verified?.title !== guide.title ||
    verified?.status !== "published" ||
    new Date(verified?.published_at || 0).getTime() !==
      new Date(guide.publishedAt).getTime() ||
    verified?.story_content !== guide.storyContent ||
    verified?.technical_content !== guide.technicalContent ||
    !sourceUrlsMatch(verified?.source_urls, guide.sourceUrls)
  ) {
    throw new Error(`Production read-back failed: ${verifyError?.message || "content mismatch"}`);
  }

  console.log(`Updated production guide ${existing.id}.`);
  console.log(
    "Cleared stale localized fields; other locales will use the truthful English source until the translation worker rebuilds them."
  );
  if (duplicateSlugs.length > 0) {
    const { data: archivedDuplicates, error: duplicateVerifyError } = await supabase
      .from("blog_posts")
      .select("slug, status")
      .in("slug", duplicateSlugs);

    if (
      duplicateVerifyError ||
      archivedDuplicates?.length !== duplicateSlugs.length ||
      archivedDuplicates.some((post) => post.status !== "archived")
    ) {
      throw new Error(
        `Duplicate archive read-back failed: ${
          duplicateVerifyError?.message || "status mismatch"
        }`
      );
    }

    console.log(`Archived duplicate: ${duplicateSlugs.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
