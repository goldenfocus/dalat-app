"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, GripVertical, Trash2, Check, Loader2, Save, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { QuestionnaireFlow } from "@/components/questionnaire";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Locale, QuestionType, QuestionCategory, MultilingualText, QuestionOption } from "@/lib/types";

interface QuestionTemplate {
  id: string;
  category: QuestionCategory;
  question_type: QuestionType;
  question_text: MultilingualText;
  description_text: MultilingualText | null;
  options: QuestionOption[] | null;
  is_system: boolean;
}

interface EventQuestion {
  id: string;
  template_id: string | null;
  sort_order: number;
  is_required: boolean;
  question_type: QuestionType;
  question_text: MultilingualText;
  description_text: MultilingualText | null;
  options: QuestionOption[] | null;
}

interface QuestionnaireBuilderProps {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  questionnaireId: string | null;
  isEnabled: boolean;
  introText: MultilingualText | null;
  questions: EventQuestion[];
  templates: QuestionTemplate[];
}

// Helper to get localized text
function getLocalizedText(text: MultilingualText | null | undefined, locale: Locale): string {
  if (!text) return "";
  return text[locale] || text.en || Object.values(text)[0] || "";
}

// Category labels
const categoryLabels: Record<QuestionCategory | string, string> = {
  logistics: "Logistics",
  dietary: "Dietary",
  contribution: "Contribution",
  personal: "Personal Info",
  custom: "Custom",
};

export function QuestionnaireBuilder({
  eventId,
  eventTitle,
  eventSlug,
  questionnaireId,
  isEnabled: initialIsEnabled,
  introText: initialIntroText,
  questions: initialQuestions,
  templates,
}: QuestionnaireBuilderProps) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = useTranslations("questionnaireBuilder");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Form state
  const [isEnabled, setIsEnabled] = useState(initialIsEnabled);
  const [introText, setIntroText] = useState(
    getLocalizedText(initialIntroText, locale)
  );
  const [questions, setQuestions] = useState<EventQuestion[]>(initialQuestions);
  const [showPreview, setShowPreview] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Group templates by category
  const templatesByCategory = templates.reduce((acc, template) => {
    const category = template.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {} as Record<string, QuestionTemplate[]>);

  // Check if a template is already added
  const isTemplateAdded = useCallback(
    (templateId: string) => questions.some((q) => q.template_id === templateId),
    [questions]
  );

  // Add question from template
  const addQuestionFromTemplate = useCallback((template: QuestionTemplate) => {
    triggerHaptic("selection");
    setQuestions((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        template_id: template.id,
        sort_order: prev.length,
        is_required: false,
        question_type: template.question_type,
        question_text: template.question_text,
        description_text: template.description_text,
        options: template.options,
      },
    ]);
  }, []);

  // Remove question
  const removeQuestion = useCallback((questionId: string) => {
    triggerHaptic("selection");
    setQuestions((prev) =>
      prev
        .filter((q) => q.id !== questionId)
        .map((q, i) => ({ ...q, sort_order: i }))
    );
  }, []);

  // Toggle required
  const toggleRequired = useCallback((questionId: string) => {
    triggerHaptic("selection");
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId ? { ...q, is_required: !q.is_required } : q
      )
    );
  }, []);

  // Move question up
  const moveQuestionUp = useCallback((index: number) => {
    if (index === 0) return;
    triggerHaptic("selection");
    setQuestions((prev) => {
      const newQuestions = [...prev];
      [newQuestions[index - 1], newQuestions[index]] = [
        newQuestions[index],
        newQuestions[index - 1],
      ];
      return newQuestions.map((q, i) => ({ ...q, sort_order: i }));
    });
  }, []);

  // Move question down
  const moveQuestionDown = useCallback((index: number) => {
    triggerHaptic("selection");
    setQuestions((prev) => {
      if (index >= prev.length - 1) return prev;
      const newQuestions = [...prev];
      [newQuestions[index], newQuestions[index + 1]] = [
        newQuestions[index + 1],
        newQuestions[index],
      ];
      return newQuestions.map((q, i) => ({ ...q, sort_order: i }));
    });
  }, []);

  // Toggle category expansion
  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Save questionnaire
  const saveQuestionnaire = useCallback(async () => {
    const supabase = createClient();
    triggerHaptic("selection");

    startTransition(async () => {
      try {
        // 1. Upsert the questionnaire
        const introTextJson = introText ? { [locale]: introText } : null;

        const { data: qData, error: qError } = await supabase
          .from("event_questionnaires")
          .upsert(
            {
              id: questionnaireId || undefined,
              event_id: eventId,
              is_enabled: isEnabled,
              intro_text: introTextJson,
            },
            { onConflict: "event_id" }
          )
          .select("id")
          .single();

        if (qError) {
          console.error("Failed to save questionnaire:", qError);
          return;
        }

        const newQuestionnaireId = qData.id;

        // 2. Delete existing questions
        await supabase
          .from("event_questions")
          .delete()
          .eq("questionnaire_id", newQuestionnaireId);

        // 3. Insert new questions
        if (questions.length > 0) {
          const questionRows = questions.map((q, index) => ({
            questionnaire_id: newQuestionnaireId,
            template_id: q.template_id,
            sort_order: index,
            is_required: q.is_required,
            // Only include custom text if no template
            custom_question_text: q.template_id ? null : q.question_text,
            custom_description_text: q.template_id ? null : q.description_text,
            custom_options: q.template_id ? null : q.options,
            custom_question_type: q.template_id ? null : q.question_type,
          }));

          const { error: insertError } = await supabase
            .from("event_questions")
            .insert(questionRows);

          if (insertError) {
            console.error("Failed to save questions:", insertError);
            return;
          }
        }

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        triggerHaptic("success");
        router.refresh();
      } catch (error) {
        console.error("Failed to save questionnaire:", error);
      }
    });
  }, [eventId, questionnaireId, isEnabled, introText, questions, locale, router]);

  // Preview questions for QuestionnaireFlow
  const previewQuestions = questions.map((q) => ({
    id: q.id,
    template_id: q.template_id,
    sort_order: q.sort_order,
    question_type: q.question_type,
    question_text: q.question_text,
    description_text: q.description_text,
    options: q.options,
    is_required: q.is_required,
  }));

  return (
    <div className="space-y-6">
      {/* Enable/Disable Toggle */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic("selection");
          setIsEnabled(!isEnabled);
        }}
        className={cn(
          "w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all duration-200",
          isEnabled
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        )}
      >
        <div className="text-left">
          <p
            className={cn(
              "text-sm font-medium",
              isEnabled ? "text-primary" : "text-foreground"
            )}
          >
            {t("enableQuestionnaire")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("enableDescription")}
          </p>
        </div>
        <div
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            isEnabled ? "bg-primary" : "bg-muted"
          )}
        >
          <div
            className={cn(
              "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm",
              isEnabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </div>
      </button>

      {/* Content only shown when enabled */}
      {isEnabled && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Intro Text */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("introText")}</label>
            <textarea
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              placeholder={t("introPlaceholder")}
              rows={2}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background resize-none"
            />
            <p className="text-xs text-muted-foreground">{t("introHint")}</p>
          </div>

          {/* Current Questions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {t("yourQuestions")} ({questions.length})
              </h3>
              {questions.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(true)}
                  className="gap-2"
                >
                  <Eye className="w-4 h-4" />
                  {t("preview")}
                </Button>
              )}
            </div>

            {questions.length === 0 ? (
              <div className="p-6 border border-dashed rounded-lg text-center">
                <p className="text-sm text-muted-foreground">{t("noQuestions")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("addFromTemplates")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {questions.map((question, index) => (
                  <div
                    key={question.id}
                    className="flex items-center gap-2 p-3 border rounded-lg bg-card"
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => moveQuestionUp(index)}
                        disabled={index === 0}
                        className="p-1 hover:bg-muted rounded disabled:opacity-30"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestionDown(index)}
                        disabled={index === questions.length - 1}
                        className="p-1 hover:bg-muted rounded disabled:opacity-30"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {getLocalizedText(question.question_text, locale)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {question.question_type === "single_choice"
                          ? t("singleChoice")
                          : question.question_type === "multi_choice"
                            ? t("multiChoice")
                            : t("textInput")}
                        {question.is_required && ` · ${t("required")}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleRequired(question.id)}
                      className={cn(
                        "px-2 py-1 text-xs rounded-full transition-colors",
                        question.is_required
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {question.is_required ? t("required") : t("optional")}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuestion(question.id)}
                      className="p-2 hover:bg-destructive/10 hover:text-destructive rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Template Categories */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t("addQuestions")}</h3>
            <div className="space-y-2">
              {Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
                <div key={category} className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <span className="text-sm font-medium">
                      {categoryLabels[category] || category}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {categoryTemplates.length} {t("templates")}
                      </span>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 transition-transform",
                          expandedCategories.has(category) && "rotate-180"
                        )}
                      />
                    </div>
                  </button>
                  {expandedCategories.has(category) && (
                    <div className="p-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                      {categoryTemplates.map((template) => {
                        const isAdded = isTemplateAdded(template.id);
                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => !isAdded && addQuestionFromTemplate(template)}
                            disabled={isAdded}
                            className={cn(
                              "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                              isAdded
                                ? "border-primary/30 bg-primary/5 cursor-default"
                                : "border-border hover:border-primary/50 hover:bg-muted/50"
                            )}
                          >
                            {isAdded ? (
                              <Check className="w-4 h-4 text-primary flex-shrink-0" />
                            ) : (
                              <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p
                                className={cn(
                                  "text-sm font-medium truncate",
                                  isAdded && "text-primary"
                                )}
                              >
                                {getLocalizedText(template.question_text, locale)}
                              </p>
                              {template.description_text && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {getLocalizedText(template.description_text, locale)}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {template.question_type === "single_choice"
                                ? t("singleChoice")
                                : template.question_type === "multi_choice"
                                  ? t("multiChoice")
                                  : t("textInput")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-sm">
          {isPending && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("saving")}
            </span>
          )}
          {saved && (
            <span className="flex items-center gap-2 text-green-600">
              <Check className="w-4 h-4" />
              {t("saved")}
            </span>
          )}
        </div>
        <Button onClick={saveQuestionnaire} disabled={isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {t("save")}
        </Button>
      </div>

      {/* Preview Sheet */}
      <Sheet open={showPreview} onOpenChange={setShowPreview}>
        <SheetContent side="bottom" className="h-[90vh] p-0 rounded-t-2xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("preview")}</SheetTitle>
          </SheetHeader>
          <div className="h-full overflow-y-auto">
            <QuestionnaireFlow
              questions={previewQuestions}
              introText={introText ? { [locale]: introText } : null}
              eventTitle={eventTitle}
              onSubmit={async () => {
                setShowPreview(false);
                triggerHaptic("success");
              }}
              onCancel={() => setShowPreview(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
