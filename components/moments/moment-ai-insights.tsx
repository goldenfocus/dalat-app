"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { TranslatedContent } from "@/components/ui/translated-content";
import { OriginalText } from "@/components/ui/original-text";
import { createClient } from "@/lib/supabase/client";
import { metadataLabels } from "@/lib/translations/metadata-labels";
import { ChevronDown, Eye, Sparkles, Tag, Palette, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface MomentAiInsightsProps {
  momentId: string;
  aiDescription: string | null;
  sceneDescription: string | null;
  aiTags: string[] | null;
  detectedObjects: string[] | null;
  detectedText: string[] | null;
  mood: string | null;
  dominantColors: string[] | null;
  locationHints: string[] | null;
  videoSummary: string | null;
  audioSummary: string | null;
  pdfSummary: string | null;
  contentType: string;
}

/**
 * AI insights section for moment detail pages.
 * The brief AI description is always visible (humans + crawlers); deeper
 * metadata (tags, OCR, mood, colors) stays in a collapsible <details> that
 * remains crawlable while unobtrusive for human visitors.
 */
export function MomentAiInsights({
  momentId,
  aiDescription,
  sceneDescription,
  aiTags,
  detectedObjects,
  detectedText,
  mood,
  dominantColors,
  locationHints,
  videoSummary,
  audioSummary,
  pdfSummary,
  contentType: _contentType,
}: MomentAiInsightsProps) {
  const t = useTranslations("moments");
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const sourceGroups = [
    metadataLabels({ ai_tags: aiTags }),
    metadataLabels({ detected_objects: detectedObjects }),
    metadataLabels({ location_hints: locationHints }),
    metadataLabels({ mood }),
    metadataLabels({ detected_text: detectedText }),
  ];
  const sourceLabels = metadataLabels({
    ai_tags: aiTags,
    detected_objects: detectedObjects,
    location_hints: locationHints,
    mood,
    detected_text: detectedText,
  });
  const sourceKey = JSON.stringify(sourceLabels);
  const key = JSON.stringify([locale, momentId, sourceKey]);
  const [labelTranslation, setLabelTranslation] = useState<{
    key: string;
    labels: string[];
  } | null>(null);
  useEffect(() => {
    if (sourceKey === "[]") return;
    let active = true;
    async function loadLabels() {
      try {
        const { data, error } = await createClient()
          .from("content_translations")
          .select("translated_text")
          .eq("content_type", "moment")
          .eq("content_id", momentId)
          .eq("target_locale", locale)
          .eq("field_name", "tags")
          .maybeSingle();
        if (error || !data) return;
        const translated: unknown = JSON.parse(data.translated_text);
        if (
          Array.isArray(translated) &&
          translated.length === JSON.parse(sourceKey).length &&
          translated.every(
            (label): label is string =>
              typeof label === "string" && !!label.trim(),
          ) &&
          active
        )
          setLabelTranslation({ key, labels: translated });
      } catch {
        /* Missing/malformed translations keep the exact source visible. */
      }
    }
    void loadLabels();
    return () => {
      active = false;
    };
  }, [key, locale, momentId, sourceKey]);
  const labels =
    labelTranslation?.key === key ? labelTranslation.labels : sourceLabels;
  const groups = sourceGroups.map((group, index) => {
    const start = sourceGroups
      .slice(0, index)
      .reduce((count, previous) => count + previous.length, 0);
    return labels.slice(start, start + group.length);
  });
  const [
    localizedTags,
    localizedObjects,
    localizedLocations,
    localizedMoods,
    localizedText,
  ] = groups;
  const localizedMood = localizedMoods[0];
  const hasTranslatedLabels = labels.some(
    (label, index) => label !== sourceLabels[index],
  );

  // Determine what summary to show based on content type
  const summary = videoSummary || audioSummary || pdfSummary || aiDescription;
  const summaryField = videoSummary
    ? "video_summary"
    : audioSummary
      ? "audio_summary"
      : pdfSummary
        ? "pdf_summary"
        : "ai_description";

  // Only render if we have at least some metadata
  const hasContent =
    summary ||
    sceneDescription ||
    sourceLabels.length ||
    dominantColors?.length;
  if (!hasContent) return null;

  const pills = [
    ...localizedTags.map((tag) => ({ label: tag, icon: Tag })),
    ...localizedObjects.map((obj) => ({ label: obj, icon: Eye })),
    ...localizedLocations.map((hint) => ({ label: hint, icon: MapPin })),
  ];

  // Deeper metadata lives in the accordion; the summary is always visible
  const hasDetails =
    (sceneDescription && sceneDescription !== summary) ||
    pills.length > 0 ||
    localizedText.length > 0 ||
    localizedMood ||
    (dominantColors && dominantColors.length > 0);

  return (
    <div className="space-y-3">
      {/* Brief AI description — always visible to humans and crawlers */}
      {summary && (
        <p className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-primary/60" />
          <TranslatedContent
            type="moment"
            id={momentId}
            field={summaryField}
            original={summary}
          />
        </p>
      )}

      {hasDetails && (
        <details
          className="group rounded-lg border border-border/50 bg-muted/30"
          open={isOpen}
          onToggle={(e) => {
            if (e.target === e.currentTarget) setIsOpen(e.currentTarget.open);
          }}
        >
          <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground transition-colors list-none [&::-webkit-details-marker]:hidden">
            <Sparkles className="w-4 h-4 text-primary/60" />
            <span>{t("aiInsights")}</span>
            <ChevronDown
              className={cn(
                "w-4 h-4 ml-auto transition-transform",
                isOpen && "rotate-180",
              )}
            />
          </summary>

          {/* All content below is crawlable even when visually collapsed */}
          <div className="px-4 pb-4 space-y-3 text-sm">
            {/* Scene description (if different from summary) */}
            {sceneDescription && sceneDescription !== summary && (
              <p className="text-muted-foreground/80 leading-relaxed italic">
                <TranslatedContent
                  type="moment"
                  id={momentId}
                  field="scene_description"
                  original={sceneDescription}
                />
              </p>
            )}

            {/* Tags and objects as pills */}
            {pills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pills.slice(0, 15).map(({ label, icon: Icon }, i) => (
                  <span
                    key={`${label}-${i}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/5 text-primary/80 text-xs"
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </span>
                ))}
              </div>
            )}

            {/* Detected text (OCR) */}
            {localizedText.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                  {t("detectedText")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {localizedText.map((text, i) => (
                    <span
                      key={i}
                      className="inline-block px-2 py-0.5 rounded bg-background border text-xs"
                    >
                      &ldquo;{text}&rdquo;
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Mood + Colors row */}
            {(localizedMood ||
              (dominantColors && dominantColors.length > 0)) && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
                {localizedMood && (
                  <span className="capitalize">{localizedMood}</span>
                )}
                {dominantColors && dominantColors.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Palette className="w-3 h-3" />
                    {dominantColors.slice(0, 5).map((color, i) => (
                      <span
                        key={i}
                        className="w-3 h-3 rounded-full border border-border/30"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {hasTranslatedLabels && (
              <OriginalText text={sourceLabels.join("\n")} />
            )}
          </div>
        </details>
      )}
    </div>
  );
}
