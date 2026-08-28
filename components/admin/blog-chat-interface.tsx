"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Sparkles, ArrowRight, RotateCcw, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { triggerTranslation } from "@/lib/translations-client";
import { VoiceRecorder } from "./voice-recorder";
import type { BlogCategory } from "@/lib/types/blog";
import type { ChatBlogOutput } from "@/lib/blog/chat-blog-prompt";
import { validateGuideForPublishing } from "@/lib/blog/guide-quality";

interface BlogChatInterfaceProps {
  categories: BlogCategory[];
}

type ChatStep = "input" | "generating" | "clarifying" | "preview" | "publishing";

interface GeneratedContent {
  story_content: string;
  technical_content: string;
  title: string;
  suggested_slug: string;
  meta_description: string;
  seo_keywords: string[];
  suggested_category: string;
  suggested_cta_url: string | null;
  suggested_cta_text: string | null;
}

export function BlogChatInterface({ categories }: BlogChatInterfaceProps) {
  const router = useRouter();

  // State
  const [step, setStep] = useState<ChatStep>("input");
  const [userInput, setUserInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [clarifyingQuestion, setClarifyingQuestion] = useState<string | null>(null);
  const [previousContext, setPreviousContext] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  // Editable fields in preview
  const [editedTitle, setEditedTitle] = useState("");
  const [editedSlug, setEditedSlug] = useState("");
  const [editedStory, setEditedStory] = useState("");
  const [editedTechnical, setEditedTechnical] = useState("");
  const resolvedCategorySlug =
    categories.find((category) => category.id === selectedCategory)?.slug ||
    generatedContent?.suggested_category;
  const guideQualityIssues =
    resolvedCategorySlug === "guides"
      ? validateGuideForPublishing({ title: editedTitle, storyContent: editedStory })
      : [];

  const handleVoiceTranscript = (text: string) => {
    setUserInput((prev) => (prev ? `${prev} ${text}` : text));
  };

  const handleGenerate = async () => {
    if (!userInput.trim()) return;

    setStep("generating");
    setError(null);

    try {
      const res = await fetch("/api/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput,
          category: selectedCategory || undefined,
          previousContext: previousContext || undefined,
        }),
      });

      const data = (await res.json()) as ChatBlogOutput & { error?: string };

      if (data.error) throw new Error(data.error);

      if (data.needs_clarification) {
        setClarifyingQuestion(data.clarifying_question);
        setPreviousContext(userInput);
        setUserInput("");
        setStep("clarifying");
      } else {
        // Got generated content
        const content: GeneratedContent = {
          story_content: data.story_content || "",
          technical_content: data.technical_content || "",
          title: data.title || "",
          suggested_slug: data.suggested_slug || "",
          meta_description: data.meta_description || "",
          seo_keywords: data.seo_keywords || [],
          suggested_category: data.suggested_category || "stories",
          suggested_cta_url: data.suggested_cta_url,
          suggested_cta_text: data.suggested_cta_text,
        };

        setGeneratedContent(content);
        setEditedTitle(content.title);
        setEditedSlug(content.suggested_slug);
        setEditedStory(content.story_content);
        setEditedTechnical(content.technical_content);

        // Auto-select suggested category if not already selected
        if (!selectedCategory && content.suggested_category) {
          const category = categories.find((c) => c.slug === content.suggested_category);
          if (category) setSelectedCategory(category.id);
        }

        setStep("preview");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStep("input");
    }
  };

  const handleClarificationResponse = async () => {
    // Continue generation with the clarification
    await handleGenerate();
  };

  const handlePublish = async (asDraft: boolean) => {
    if (!generatedContent) return;

    setStep("publishing");
    setError(null);

    try {
      const supabase = createClient();

      // Get category ID
      const categoryId = selectedCategory || categories.find((c) => c.slug === generatedContent.suggested_category)?.id;
      const categorySlug =
        categories.find((category) => category.id === categoryId)?.slug ||
        generatedContent.suggested_category;

      if (!asDraft && categorySlug === "guides") {
        const guideIssues = validateGuideForPublishing({
          title: editedTitle,
          storyContent: editedStory,
        });
        if (guideIssues.length > 0) {
          throw new Error(
            `This guide is not ready to publish:\n${guideIssues
              .map((issue) => `• ${issue.message}`)
              .join("\n")}`
          );
        }
      }

      const { data, error: createError } = await supabase.rpc("admin_create_blog_post", {
        p_title: editedTitle,
        p_slug: editedSlug,
        p_story_content: editedStory,
        p_technical_content: editedTechnical,
        p_source: "manual",
        p_status: asDraft ? "draft" : "published",
        p_category_id: categoryId || null,
        p_meta_description: generatedContent.meta_description,
        p_seo_keywords: generatedContent.seo_keywords,
        p_suggested_cta_url: generatedContent.suggested_cta_url,
        p_suggested_cta_text: generatedContent.suggested_cta_text,
      });

      if (createError) throw createError;

      // Trigger translation for all translatable fields (fire-and-forget)
      if (data?.post_id) {
        triggerTranslation("blog", data.post_id, [
          { field_name: "title", text: editedTitle },
          { field_name: "story_content", text: editedStory },
          { field_name: "technical_content", text: editedTechnical },
          { field_name: "meta_description", text: generatedContent.meta_description },
        ]);
      }

      // Redirect to edit page or list
      if (data?.post_id) {
        router.push(`/admin/blog/${data.post_id}/edit`);
      } else {
        router.push("/admin/blog");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publishing failed");
      setStep("preview");
    }
  };

  const handleStartOver = () => {
    setStep("input");
    setUserInput("");
    setSelectedCategory("");
    setClarifyingQuestion(null);
    setPreviousContext(null);
    setGeneratedContent(null);
    setError(null);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 whitespace-pre-line">
          {error}
        </div>
      )}

      {/* Step: Input */}
      {step === "input" && (
        <div className="space-y-8">
          {/* Opening prompt */}
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">Hey - what do you want to blog about?</h2>
            <p className="text-muted-foreground">
              Speak your thoughts or type them out. I&apos;ll help shape them into a post.
            </p>
          </div>

          {/* Voice Recorder */}
          <div className="py-8">
            <VoiceRecorder
              onTranscript={handleVoiceTranscript}
              onError={(err) => setError(err)}
            />
          </div>

          {/* Text Input */}
          <div className="space-y-4">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Type your thoughts here..."
              rows={4}
              className="w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />

            {/* Category (optional) */}
            <div className="flex items-center gap-4">
              <label className="text-sm text-muted-foreground">Category (optional):</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              >
                <option value="">Auto-detect</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!userInput.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-5 h-5" />
              Generate Post
            </button>
          </div>
        </div>
      )}

      {/* Step: Generating */}
      {step === "generating" && (
        <div className="text-center py-16">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-lg text-muted-foreground">Crafting your post...</p>
        </div>
      )}

      {/* Step: Clarifying */}
      {step === "clarifying" && clarifyingQuestion && (
        <div className="space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">Quick question</h2>
            <p className="text-lg text-muted-foreground">{clarifyingQuestion}</p>
          </div>

          <div className="space-y-4">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Your answer..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />

            <div className="flex gap-3">
              <button
                onClick={handleStartOver}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Start Over
              </button>
              <button
                onClick={handleClarificationResponse}
                disabled={!userInput.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && generatedContent && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Preview</h2>
            <button
              onClick={handleStartOver}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Start Over
            </button>
          </div>

          {/* Editable Title */}
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg font-semibold"
            />
          </div>

          {/* Editable Slug */}
          <div>
            <label className="block text-sm font-medium mb-2">URL Slug</label>
            <input
              type="text"
              value={editedSlug}
              onChange={(e) => setEditedSlug(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
            />
          </div>

          {/* Story Content */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {resolvedCategorySlug === "guides" ? "Guide Content" : "Story Content"}
            </label>
            <textarea
              value={editedStory}
              onChange={(e) => setEditedStory(e.target.value)}
              rows={8}
              className="w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
            {resolvedCategorySlug === "guides" && (
              <div
                className={`mt-3 rounded-lg border p-3 text-sm ${
                  guideQualityIssues.length === 0
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                }`}
              >
                {guideQualityIssues.length === 0 ? (
                  <p>Guide publishing checks pass.</p>
                ) : (
                  <>
                    <p className="font-medium mb-2">Before publishing:</p>
                    <ul className="space-y-1 list-disc pl-5">
                      {guideQualityIssues.map((issue) => (
                        <li key={issue.code}>{issue.message}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Technical Content (toggleable) */}
          <div>
            <button
              onClick={() => setShowTechnical(!showTechnical)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2"
            >
              {showTechnical ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showTechnical ? "Hide" : "Show"}{" "}
              {resolvedCategorySlug === "guides" ? "Optional Extra Details" : "Technical Content"}
            </button>
            {showTechnical && (
              <textarea
                value={editedTechnical}
                onChange={(e) => setEditedTechnical(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono text-sm"
              />
            )}
          </div>

          {/* Category Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Publish Actions */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => handlePublish(true)}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors font-medium"
            >
              Save as Draft
            </button>
            <button
              onClick={() => handlePublish(false)}
              disabled={resolvedCategorySlug === "guides" && guideQualityIssues.length > 0}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRight className="w-5 h-5" />
              Publish Now
            </button>
          </div>
        </div>
      )}

      {/* Step: Publishing */}
      {step === "publishing" && (
        <div className="text-center py-16">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-lg text-muted-foreground">Publishing your post...</p>
        </div>
      )}
    </div>
  );
}
