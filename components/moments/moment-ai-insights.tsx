"use client";

import { useState } from "react";
import { ChevronDown, Eye, Sparkles, Tag, Palette, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface MomentAiInsightsProps {
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
 * Collapsible AI insights section for moment detail pages.
 * Renders AI-extracted metadata visible to crawlers (in <details>) while
 * staying unobtrusive for human visitors.
 */
export function MomentAiInsights({
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
  contentType,
}: MomentAiInsightsProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Determine what summary to show based on content type
  const summary = videoSummary || audioSummary || pdfSummary || aiDescription;

  // Only render if we have at least some metadata
  const hasContent = summary || aiTags?.length || detectedObjects?.length || detectedText?.length;
  if (!hasContent) return null;

  const pills = [
    ...(aiTags || []).map((tag) => ({ label: tag, icon: Tag })),
    ...(detectedObjects || []).map((obj) => ({ label: obj, icon: Eye })),
    ...(locationHints || []).map((hint) => ({ label: hint, icon: MapPin })),
  ];

  return (
    <details
      className="group rounded-lg border border-border/50 bg-muted/30"
      open={isOpen}
      onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground transition-colors list-none [&::-webkit-details-marker]:hidden">
        <Sparkles className="w-4 h-4 text-primary/60" />
        <span>AI Insights</span>
        <ChevronDown
          className={cn(
            "w-4 h-4 ml-auto transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </summary>

      {/* All content below is crawlable even when visually collapsed */}
      <div className="px-4 pb-4 space-y-3 text-sm">
        {/* Description / Summary */}
        {summary && (
          <p className="text-muted-foreground leading-relaxed">{summary}</p>
        )}

        {/* Scene description (if different from summary) */}
        {sceneDescription && sceneDescription !== summary && (
          <p className="text-muted-foreground/80 leading-relaxed italic">
            {sceneDescription}
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
        {detectedText && detectedText.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
              Text found in {contentType}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {detectedText.map((text, i) => (
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
        {(mood || (dominantColors && dominantColors.length > 0)) && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
            {mood && (
              <span className="capitalize">{mood}</span>
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
      </div>
    </details>
  );
}
