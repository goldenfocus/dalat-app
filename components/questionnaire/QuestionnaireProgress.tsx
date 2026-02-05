"use client";

import { cn } from "@/lib/utils";

interface QuestionnaireProgressProps {
  totalSteps: number;
  currentStep: number; // 0-indexed
  className?: string;
}

/**
 * Typeform-style progress indicator with connected dots
 */
export function QuestionnaireProgress({
  totalSteps,
  currentStep,
  className,
}: QuestionnaireProgressProps) {
  return (
    <div className={cn("flex justify-center items-center gap-0", className)}>
      {Array.from({ length: totalSteps }).map((_, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;

        return (
          <div key={index} className="flex items-center">
            {/* Dot */}
            <div
              className={cn(
                "rounded-full transition-all duration-300",
                isActive && "w-3 h-3 bg-primary scale-110",
                isCompleted && "w-2.5 h-2.5 bg-primary",
                !isActive && !isCompleted && "w-2.5 h-2.5 bg-muted-foreground/30"
              )}
            />
            {/* Connecting line (not after last dot) */}
            {index < totalSteps - 1 && (
              <div
                className={cn(
                  "w-6 h-0.5 transition-all duration-500",
                  isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
