"use client";

import { useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuestionnaireProgress } from "./QuestionnaireProgress";
import { QuestionnaireComplete } from "./QuestionnaireComplete";
import { SingleChoiceQuestion } from "./questions/SingleChoiceQuestion";
import { MultiChoiceQuestion } from "./questions/MultiChoiceQuestion";
import { TextQuestion } from "./questions/TextQuestion";
import type { ResolvedQuestion, MultilingualText, Locale } from "@/lib/types";

interface QuestionnaireFlowProps {
  questions: ResolvedQuestion[];
  introText?: MultilingualText | null;
  eventTitle: string;
  onSubmit: (responses: Record<string, string | string[]>) => Promise<void>;
  onCancel: () => void;
}

type FlowStep = "welcome" | "questions" | "complete";

export function QuestionnaireFlow({
  questions,
  introText,
  eventTitle,
  onSubmit,
  onCancel,
}: QuestionnaireFlowProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations("questionnaire");

  const [step, setStep] = useState<FlowStep>("welcome");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string | string[]>>({});
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("left");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;
  const isFirstQuestion = currentQuestionIndex === 0;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  const getText = (text: MultilingualText | null | undefined): string => {
    if (!text) return "";
    return text[locale] || text.en || Object.values(text)[0] || "";
  };

  // Get current response value for a question
  const getCurrentResponse = useCallback(
    (questionId: string, questionType: string) => {
      const response = responses[questionId];
      if (questionType === "multi_choice") {
        return Array.isArray(response) ? response : [];
      }
      if (questionType === "text") {
        return typeof response === "string" ? response : "";
      }
      return typeof response === "string" ? response : null;
    },
    [responses]
  );

  // Update response for current question
  const updateResponse = useCallback(
    (questionId: string, value: string | string[]) => {
      setResponses((prev) => ({ ...prev, [questionId]: value }));
    },
    []
  );

  // Check if current question is answered (for required validation)
  const isCurrentQuestionAnswered = useCallback(() => {
    if (!currentQuestion) return true;
    const response = responses[currentQuestion.id];

    if (!currentQuestion.is_required) return true;

    if (currentQuestion.question_type === "multi_choice") {
      return Array.isArray(response) && response.length > 0;
    }
    if (currentQuestion.question_type === "text") {
      return typeof response === "string" && response.trim().length > 0;
    }
    return response !== undefined && response !== null && response !== "";
  }, [currentQuestion, responses]);

  // Handle start questionnaire
  const handleStart = () => {
    setSlideDirection("left");
    setStep("questions");
  };

  // Handle next question
  const handleNext = useCallback(() => {
    if (!isCurrentQuestionAnswered()) {
      setError(t("errors.required"));
      return;
    }
    setError(null);

    if (isLastQuestion) {
      // Submit responses
      handleSubmit();
    } else {
      setSlideDirection("left");
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  }, [isLastQuestion, isCurrentQuestionAnswered, t]);

  // Handle previous question
  const handlePrevious = useCallback(() => {
    setError(null);
    if (isFirstQuestion) {
      setSlideDirection("right");
      setStep("welcome");
    } else {
      setSlideDirection("right");
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  }, [isFirstQuestion]);

  // Handle single choice auto-advance
  const handleSingleChoiceSelect = useCallback(
    (questionId: string, value: string) => {
      updateResponse(questionId, value);

      // Auto-advance after short delay for single choice
      if (!isLastQuestion) {
        setTimeout(() => {
          setSlideDirection("left");
          setCurrentQuestionIndex((prev) => prev + 1);
        }, 300);
      }
    },
    [isLastQuestion, updateResponse]
  );

  // Submit all responses
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(responses);
      setSlideDirection("left");
      setStep("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.submitFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render welcome screen
  if (step === "welcome") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-6 py-8 text-center space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">{t("welcome.title")}</h2>
          <p className="text-muted-foreground">
            {introText ? getText(introText) : t("welcome.subtitle", { organizer: "" })}
          </p>
        </div>

        <QuestionnaireProgress
          totalSteps={totalQuestions}
          currentStep={-1}
          className="opacity-50"
        />

        <div className="space-y-4 w-full max-w-xs">
          <Button onClick={handleStart} size="lg" className="w-full">
            {t("welcome.start")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("welcome.time", { seconds: totalQuestions * 5 })}
          </p>
        </div>

        <button
          onClick={onCancel}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("cancel")}
        </button>
      </div>
    );
  }

  // Render completion screen
  if (step === "complete") {
    return (
      <QuestionnaireComplete
        eventTitle={eventTitle}
        onClose={onCancel}
      />
    );
  }

  // Render question
  return (
    <div className="flex flex-col min-h-[400px]">
      {/* Header with back button and progress */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={handlePrevious}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t("back")}</span>
        </button>
        <span className="text-sm text-muted-foreground">
          {t("progress", { current: currentQuestionIndex + 1, total: totalQuestions })}
        </span>
      </div>

      {/* Progress bar */}
      <QuestionnaireProgress
        totalSteps={totalQuestions}
        currentStep={currentQuestionIndex}
        className="px-4 mb-6"
      />

      {/* Question content with animation */}
      <div className="flex-1 px-4 pb-6">
        <div
          key={currentQuestion.id}
          className={cn(
            "animate-in duration-300 fill-mode-both",
            slideDirection === "left"
              ? "fade-in slide-in-from-right-4"
              : "fade-in slide-in-from-left-4"
          )}
        >
          {currentQuestion.question_type === "single_choice" && currentQuestion.options && (
            <SingleChoiceQuestion
              questionText={currentQuestion.question_text}
              descriptionText={currentQuestion.description_text}
              options={currentQuestion.options}
              value={getCurrentResponse(currentQuestion.id, "single_choice") as string | null}
              onChange={(value) => handleSingleChoiceSelect(currentQuestion.id, value)}
              locale={locale}
              isRequired={currentQuestion.is_required}
            />
          )}

          {currentQuestion.question_type === "multi_choice" && currentQuestion.options && (
            <MultiChoiceQuestion
              questionText={currentQuestion.question_text}
              descriptionText={currentQuestion.description_text}
              options={currentQuestion.options}
              value={getCurrentResponse(currentQuestion.id, "multi_choice") as string[]}
              onChange={(value) => updateResponse(currentQuestion.id, value)}
              locale={locale}
              isRequired={currentQuestion.is_required}
            />
          )}

          {currentQuestion.question_type === "text" && (
            <TextQuestion
              questionText={currentQuestion.question_text}
              descriptionText={currentQuestion.description_text}
              value={getCurrentResponse(currentQuestion.id, "text") as string}
              onChange={(value) => updateResponse(currentQuestion.id, value)}
              locale={locale}
              isRequired={currentQuestion.is_required}
            />
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 pb-2">
          <p className="text-sm text-destructive text-center">{error}</p>
        </div>
      )}

      {/* Footer with next/submit button (for non-single-choice questions) */}
      {(currentQuestion.question_type !== "single_choice" || isLastQuestion) && (
        <div className="px-4 pb-6">
          <Button
            onClick={handleNext}
            disabled={isSubmitting}
            size="lg"
            className="w-full"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isLastQuestion ? (
              t("submit")
            ) : (
              <>
                {t("next")}
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
