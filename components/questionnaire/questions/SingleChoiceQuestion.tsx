"use client";

import { cn } from "@/lib/utils";
import { Touchable } from "@/components/ui/touchable";
import { Check } from "lucide-react";
import type { QuestionOption, MultilingualText, Locale } from "@/lib/types";

interface SingleChoiceQuestionProps {
  questionText: MultilingualText;
  descriptionText?: MultilingualText | null;
  options: QuestionOption[];
  value: string | null;
  onChange: (value: string) => void;
  locale: Locale;
  isRequired?: boolean;
}

export function SingleChoiceQuestion({
  questionText,
  descriptionText,
  options,
  value,
  onChange,
  locale,
  isRequired,
}: SingleChoiceQuestionProps) {
  const getText = (text: MultilingualText | null | undefined): string => {
    if (!text) return "";
    return text[locale] || text.en || Object.values(text)[0] || "";
  };

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

      {/* Options */}
      <div className="space-y-3">
        {options.map((option) => {
          const isSelected = value === option.value;
          return (
            <Touchable
              key={option.value}
              onClick={() => onChange(option.value)}
              haptic="selection"
              className={cn(
                "w-full p-4 rounded-xl border-2 transition-all cursor-pointer",
                "min-h-[56px] flex items-center justify-between",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
              )}
            >
              <span className={cn(
                "font-medium",
                isSelected && "text-primary"
              )}>
                {getText(option.label)}
              </span>
              {isSelected && (
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
            </Touchable>
          );
        })}
      </div>
    </div>
  );
}
