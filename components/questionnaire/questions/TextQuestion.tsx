"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import type { MultilingualText, Locale } from "@/lib/types";

interface TextQuestionProps {
  questionText: MultilingualText;
  descriptionText?: MultilingualText | null;
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  isRequired?: boolean;
  placeholder?: string;
}

export function TextQuestion({
  questionText,
  descriptionText,
  value,
  onChange,
  locale,
  isRequired,
  placeholder,
}: TextQuestionProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getText = (text: MultilingualText | null | undefined): string => {
    if (!text) return "";
    return text[locale] || text.en || Object.values(text)[0] || "";
  };

  // Auto-focus on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 300); // Wait for animation
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6">
      {/* Question */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-center">
          {getText(questionText)}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </h2>
        {descriptionText && (
          <p className="text-sm text-muted-foreground text-center">
            {getText(descriptionText)}
          </p>
        )}
      </div>

      {/* Text input */}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Type your answer..."}
        className={cn(
          "min-h-[120px] text-lg resize-none",
          "focus-visible:ring-2 focus-visible:ring-primary"
        )}
        rows={4}
      />

      {!isRequired && (
        <p className="text-xs text-muted-foreground text-center">
          Optional - you can skip this question
        </p>
      )}
    </div>
  );
}
