"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Eye, ImageIcon, Sparkles, Wand2, ChevronDown, ChevronUp } from "lucide-react";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { createClient } from "@/lib/supabase/client";
import { triggerTranslation } from "@/lib/translations-client";
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";
import type { BlogCategory, BlogPostStatus, BlogPostSource } from "@/lib/types/blog";
import Image from "next/image";

interface BlogPostData {
  id: string;
  slug: string;
  title: string;
  story_content: string;
  technical_content: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  cover_image_description: string | null;
  cover_image_keywords: string[] | null;
  cover_image_colors: string[] | null;
  source: string;
  status: string;
  version: string | null;
  summary_date: string | null;
  areas_changed: string[] | null;
  meta_description: string | null;
  seo_keywords: string[] | null;
  suggested_cta_url: string | null;
  suggested_cta_text: string | null;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
}

interface BlogPostFormProps {
  post: BlogPostData;
  categories: BlogCategory[];
}

const STATUS_OPTIONS: { value: BlogPostStatus; label: string; description: string }[] = [
  { value: "draft", label: "Draft", description: "Not visible to public" },
  { value: "experimental", label: "Experimental", description: "Published with WIP badge" },
  { value: "published", label: "Published", description: "Fully visible to public" },
  { value: "deprecated", label: "Deprecated", description: "Shown with deprecation notice" },
  { value: "archived", label: "Archived", description: "Hidden from everyone" },
];

export function BlogPostForm({ post, categories }: BlogPostFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [storyContent, setStoryContent] = useState(post.story_content);
  const [technicalContent, setTechnicalContent] = useState(post.technical_content);
  const [status, setStatus] = useState<BlogPostStatus>(post.status as BlogPostStatus);
  const [categoryId, setCategoryId] = useState(post.category_id || "");
  const [coverImageUrl, setCoverImageUrl] = useState(post.cover_image_url || "");
  const [coverImageAlt, setCoverImageAlt] = useState(post.cover_image_alt || "");
  const [coverImageDescription, setCoverImageDescription] = useState(post.cover_image_description || "");
  const [coverImageKeywords, setCoverImageKeywords] = useState(post.cover_image_keywords?.join(", ") || "");
  const [coverImageColors, setCoverImageColors] = useState(post.cover_image_colors || []);
  const [showImageMetadata, setShowImageMetadata] = useState(false);
  const [metaDescription, setMetaDescription] = useState(post.meta_description || "");
  const [seoKeywords, setSeoKeywords] = useState(post.seo_keywords?.join(", ") || "");
  const [ctaUrl, setCtaUrl] = useState(post.suggested_cta_url || "");
  const [ctaText, setCtaText] = useState(post.suggested_cta_text || "");
  const [areasChanged, setAreasChanged] = useState(post.areas_changed?.join(", ") || "");
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [showCustomizePrompt, setShowCustomizePrompt] = useState(false);
  const [showRefinement, setShowRefinement] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Build the default prompt from current form values
  const buildDefaultPrompt = () => {
    const categorySlug = categories.find((c) => c.id === categoryId)?.slug || "general";
    return `Create an abstract, artistic cover image for a blog post about: ${title}

Context: ${storyContent?.slice(0, 200) || "A blog post about technology and community events"}
Category: ${categorySlug}

Style guidelines:
- Modern, clean, tech-forward aesthetic
- Purple and blue gradient background inspired by dalat.app branding
- Abstract geometric shapes or flowing lines relevant to the topic
- Subtle visual elements that hint at the subject matter
- Atmospheric depth with soft glow effects
- NO text, NO lettering, NO words
- Landscape orientation (16:9 aspect ratio)
- Professional and polished feel`;
  };

  const [customPrompt, setCustomPrompt] = useState("");

  interface CoverGenerationResult {
    imageUrl: string;
    metadata?: {
      alt: string;
      description: string;
      keywords: string[];
      colors: string[];
    };
  }

  const generateCover = async (refineExisting?: boolean): Promise<CoverGenerationResult | null> => {
    const payload: Record<string, string> = {
      title,
      content: storyContent.slice(0, 500),
      category: categories.find((c) => c.id === categoryId)?.slug || "changelog",
    };

    // If refining, include existing image and refinement prompt
    if (refineExisting && coverImageUrl && refinementPrompt.trim()) {
      payload.existingImageUrl = coverImageUrl;
      payload.refinementPrompt = refinementPrompt.trim();
    } else if (showCustomizePrompt && customPrompt.trim()) {
      // Use custom prompt if provided
      payload.customPrompt = customPrompt.trim();
    }

    const res = await fetch("/api/blog/generate-cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { imageUrl: data.imageUrl, metadata: data.metadata };
  };

  // Apply metadata from generation result
  const applyGeneratedMetadata = (result: CoverGenerationResult) => {
    setCoverImageUrl(result.imageUrl);
    if (result.metadata) {
      setCoverImageAlt(result.metadata.alt);
      setCoverImageDescription(result.metadata.description);
      setCoverImageKeywords(result.metadata.keywords.join(", "));
      setCoverImageColors(result.metadata.colors);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      let finalCoverUrl = coverImageUrl;
      let finalAlt = coverImageAlt;
      let finalDescription = coverImageDescription;
      let finalKeywords = coverImageKeywords;
      let finalColors = coverImageColors;

      // Auto-generate cover if publishing without one
      const isPublishing = status === "published" || status === "experimental";
      if (isPublishing && !coverImageUrl && storyContent.trim()) {
        setIsGeneratingCover(true);
        try {
          const result = await generateCover();
          if (result) {
            finalCoverUrl = result.imageUrl;
            applyGeneratedMetadata(result);
            if (result.metadata) {
              finalAlt = result.metadata.alt;
              finalDescription = result.metadata.description;
              finalKeywords = result.metadata.keywords.join(", ");
              finalColors = result.metadata.colors;
            }
          }
        } finally {
          setIsGeneratingCover(false);
        }
      }

      const supabase = createClient();
      const { error: updateError } = await supabase.rpc("update_blog_post", {
        p_post_id: post.id,
        p_title: title,
        p_slug: slug,
        p_story_content: storyContent,
        p_technical_content: technicalContent,
        p_cover_image_url: finalCoverUrl || null,
        p_cover_image_alt: finalAlt || null,
        p_cover_image_description: finalDescription || null,
        p_cover_image_keywords: finalKeywords ? finalKeywords.split(",").map((k) => k.trim()) : null,
        p_cover_image_colors: finalColors.length > 0 ? finalColors : null,
        p_status: status,
        p_category_id: categoryId || null,
        p_meta_description: metaDescription || null,
        p_seo_keywords: seoKeywords ? seoKeywords.split(",").map((k) => k.trim()) : null,
        p_suggested_cta_url: ctaUrl || null,
        p_suggested_cta_text: ctaText || null,
      });

      if (updateError) throw updateError;

      // Re-trigger translation when content changes (fire-and-forget)
      triggerTranslation("blog", post.id, [
        { field_name: "title", text: title },
        { field_name: "story_content", text: storyContent },
        { field_name: "technical_content", text: technicalContent },
        { field_name: "meta_description", text: metaDescription },
      ]);

      router.refresh();
      router.push("/admin/blog");
    } catch (err) {
      console.error("Failed to save post:", err);
      setError(err instanceof Error ? err.message : "Failed to save post");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateCover = async () => {
    if (!storyContent.trim()) {
      setError("Story content is required to generate a cover image");
      return;
    }

    setIsGeneratingCover(true);
    setError(null);

    try {
      const result = await generateCover();
      if (result) applyGeneratedMetadata(result);
    } catch (err) {
      console.error("Failed to generate cover:", err);
      setError(err instanceof Error ? err.message : "Failed to generate cover");
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleRefineCover = async () => {
    if (!coverImageUrl) {
      setError("No existing image to refine");
      return;
    }
    if (!refinementPrompt.trim()) {
      setError("Please describe how you'd like to modify the image");
      return;
    }

    setIsGeneratingCover(true);
    setError(null);

    try {
      const result = await generateCover(true);
      if (result) {
        applyGeneratedMetadata(result);
        setRefinementPrompt(""); // Clear after successful refinement
      }
    } catch (err) {
      console.error("Failed to refine cover:", err);
      setError(err instanceof Error ? err.message : "Failed to refine cover");
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title & Slug */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
              />
            </div>
          </div>

          {/* Story Content */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Story Content
              <span className="text-muted-foreground font-normal ml-2">(Human-readable)</span>
            </label>
            <AIEnhanceTextarea
              value={storyContent}
              onChange={setStoryContent}
              context="a blog post story for dalat.app"
              rows={12}
              className="font-sans"
            />
          </div>

          {/* Technical Content */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Technical Content
              <span className="text-muted-foreground font-normal ml-2">(Machine-readable)</span>
            </label>
            <AIEnhanceTextarea
              value={technicalContent}
              onChange={setTechnicalContent}
              context="technical documentation for a changelog"
              rows={12}
              className="font-mono text-sm"
            />
          </div>
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="p-4 rounded-lg border bg-card space-y-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </button>
            {status === "published" && (
              <a
                href={`/blog/${selectedCategory?.slug || "changelog"}/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
              >
                <Eye className="h-4 w-4" />
                View Live
              </a>
            )}
          </div>

          {/* Status */}
          <div className="p-4 rounded-lg border bg-card space-y-3">
            <label className="block text-sm font-medium">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BlogPostStatus)}
              className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {STATUS_OPTIONS.find((o) => o.value === status)?.description}
            </p>
          </div>

          {/* Category */}
          <div className="p-4 rounded-lg border bg-card space-y-3">
            <label className="block text-sm font-medium">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Cover Image */}
          <div className="p-4 rounded-lg border bg-card space-y-3">
            <label className="block text-sm font-medium">Cover Image</label>

            {/* Image preview - clickable to zoom */}
            {coverImageUrl ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="relative aspect-video rounded-lg overflow-hidden w-full cursor-zoom-in group"
              >
                <Image
                  src={coverImageUrl}
                  alt="Cover"
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium">
                    Click to preview
                  </span>
                </div>
              </button>
            ) : (
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              </div>
            )}

            {/* Lightbox for full-size view */}
            <ImageLightbox
              src={coverImageUrl}
              alt={coverImageAlt || "Cover preview"}
              isOpen={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
            />

            {/* Image Metadata (SEO/AEO/GEO) - collapsible */}
            {coverImageUrl && (
              <>
                <button
                  type="button"
                  onClick={() => setShowImageMetadata(!showImageMetadata)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors text-sm"
                >
                  <span className="flex items-center gap-2 text-emerald-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    Image SEO Metadata
                  </span>
                  {showImageMetadata ? (
                    <ChevronUp className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-emerald-400" />
                  )}
                </button>

                {showImageMetadata && (
                  <div className="space-y-3 pl-2 border-l-2 border-emerald-500/30">
                    {/* Alt Text */}
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">
                        Alt Text <span className="text-emerald-400">(accessibility)</span>
                      </label>
                      <input
                        type="text"
                        value={coverImageAlt}
                        onChange={(e) => setCoverImageAlt(e.target.value)}
                        placeholder="Brief description for screen readers..."
                        className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">
                        Description <span className="text-emerald-400">(AI search)</span>
                      </label>
                      <textarea
                        value={coverImageDescription}
                        onChange={(e) => setCoverImageDescription(e.target.value)}
                        placeholder="Detailed description for AI search engines..."
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm resize-none"
                      />
                    </div>

                    {/* Keywords */}
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">
                        Keywords <span className="text-emerald-400">(comma-separated)</span>
                      </label>
                      <input
                        type="text"
                        value={coverImageKeywords}
                        onChange={(e) => setCoverImageKeywords(e.target.value)}
                        placeholder="abstract, purple, geometric..."
                        className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
                      />
                    </div>

                    {/* Colors */}
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">
                        Dominant Colors
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {coverImageColors.map((color, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs"
                          >
                            <span
                              className="w-3 h-3 rounded-full border border-white/20"
                              style={{ backgroundColor: color }}
                            />
                            <span className="font-mono">{color}</span>
                          </div>
                        ))}
                        {coverImageColors.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            Colors will be extracted on generation
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Customize prompt toggle */}
            <button
              type="button"
              onClick={() => {
                if (!showCustomizePrompt && !customPrompt) {
                  setCustomPrompt(buildDefaultPrompt());
                }
                setShowCustomizePrompt(!showCustomizePrompt);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-sm"
            >
              <span className="text-muted-foreground">Customize prompt</span>
              {showCustomizePrompt ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showCustomizePrompt && (
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-xs font-mono resize-none"
              />
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerateCover}
              disabled={isGeneratingCover}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm disabled:opacity-50"
            >
              {isGeneratingCover ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {coverImageUrl ? "Regenerate" : "Generate Cover"}
            </button>

            {/* Refinement - collapsible, only when image exists */}
            {coverImageUrl && (
              <>
                <button
                  type="button"
                  onClick={() => setShowRefinement(!showRefinement)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 transition-colors text-sm"
                >
                  <span className="flex items-center gap-2 text-violet-400">
                    <Wand2 className="h-4 w-4" />
                    Refine this image
                  </span>
                  {showRefinement ? (
                    <ChevronUp className="h-4 w-4 text-violet-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-violet-400" />
                  )}
                </button>

                {showRefinement && (
                  <div className="space-y-2 pl-2 border-l-2 border-violet-500/30">
                    <textarea
                      value={refinementPrompt}
                      onChange={(e) => setRefinementPrompt(e.target.value)}
                      placeholder="e.g., Add more purple tones, make it more abstract, add circuit patterns..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm resize-none"
                    />
                    <button
                      onClick={handleRefineCover}
                      disabled={isGeneratingCover || !refinementPrompt.trim()}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-violet-600 text-white hover:bg-violet-700 transition-colors text-sm disabled:opacity-50"
                    >
                      {isGeneratingCover ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                      Apply Refinement
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* SEO */}
          <div className="p-4 rounded-lg border bg-card space-y-3">
            <label className="block text-sm font-medium">SEO</label>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Meta Description</label>
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Keywords (comma-separated)</label>
              <input
                type="text"
                value={seoKeywords}
                onChange={(e) => setSeoKeywords(e.target.value)}
                placeholder="dalat, events, ..."
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </div>
          </div>

          {/* CTA */}
          <div className="p-4 rounded-lg border bg-card space-y-3">
            <label className="block text-sm font-medium">Call to Action</label>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">CTA URL</label>
              <input
                type="text"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="/events"
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">CTA Text</label>
              <input
                type="text"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                placeholder="Explore Events"
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </div>
          </div>

          {/* Areas Changed (for daily summaries) */}
          {post.source === "daily_summary" && (
            <div className="p-4 rounded-lg border bg-card space-y-3">
              <label className="block text-sm font-medium">Areas Changed</label>
              <input
                type="text"
                value={areasChanged}
                onChange={(e) => setAreasChanged(e.target.value)}
                placeholder="Events, Moments, Auth..."
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              <p className="text-xs text-muted-foreground">Comma-separated areas affected</p>
            </div>
          )}

          {/* Metadata */}
          <div className="p-4 rounded-lg border bg-card space-y-2 text-xs text-muted-foreground">
            <div>Source: <span className="font-medium">{post.source}</span></div>
            {post.version && <div>Version: <span className="font-medium">v{post.version}</span></div>}
            {post.summary_date && <div>Summary Date: <span className="font-medium">{post.summary_date}</span></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
