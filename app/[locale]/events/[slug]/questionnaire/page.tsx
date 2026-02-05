import { notFound, redirect } from "next/navigation";
import { ClipboardList, ArrowLeft, BarChart3 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { QuestionnaireBuilder } from "@/components/events/questionnaire-builder";
import type { QuestionType, QuestionCategory, MultilingualText, QuestionOption } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

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

export default async function QuestionnairePage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const t = await getTranslations("questionnaireBuilder");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch the event
  const { data: event, error } = await supabase
    .from("events")
    .select("id, slug, title, created_by")
    .eq("slug", slug)
    .single();

  if (error || !event) {
    notFound();
  }

  // Check if user is the creator (or admin - could add later)
  if (event.created_by !== user.id) {
    redirect(`/events/${slug}`);
  }

  // Fetch questionnaire for this event (if exists)
  const { data: questionnaire } = await supabase
    .from("event_questionnaires")
    .select("id, is_enabled, intro_text")
    .eq("event_id", event.id)
    .single();

  // Fetch current questions for this event
  let questions: EventQuestion[] = [];
  if (questionnaire) {
    const { data: questionData } = await supabase
      .from("event_questions")
      .select(`
        id,
        template_id,
        sort_order,
        is_required,
        custom_question_type,
        custom_question_text,
        custom_description_text,
        custom_options,
        question_templates (
          question_type,
          question_text,
          description_text,
          options
        )
      `)
      .eq("questionnaire_id", questionnaire.id)
      .order("sort_order", { ascending: true });

    if (questionData) {
      questions = questionData.map((q) => {
        // Handle the foreign key relation (may come as object or in rare cases array)
        const templateData = q.question_templates;
        const template = (Array.isArray(templateData) ? templateData[0] : templateData) as {
          question_type: QuestionType;
          question_text: MultilingualText;
          description_text: MultilingualText | null;
          options: QuestionOption[] | null;
        } | null;

        return {
          id: q.id,
          template_id: q.template_id,
          sort_order: q.sort_order,
          is_required: q.is_required,
          question_type: (template?.question_type || q.custom_question_type || "text") as QuestionType,
          question_text: (template?.question_text || q.custom_question_text || {}) as MultilingualText,
          description_text: template?.description_text || q.custom_description_text,
          options: template?.options || q.custom_options,
        };
      });
    }
  }

  // Fetch all available templates
  const { data: templates } = await supabase
    .from("question_templates")
    .select("id, category, question_type, question_text, description_text, options, is_system")
    .eq("is_active", true)
    .order("category")
    .order("question_text");

  // Count responses if questionnaire exists
  let responseCount = 0;
  if (questionnaire) {
    const { count } = await supabase
      .from("rsvp_responses")
      .select("rsvp_id", { count: "exact", head: true })
      .in(
        "question_id",
        questions.map((q) => q.id)
      );
    // Count unique rsvp_ids would be better, but this gives us a quick estimate
    responseCount = count || 0;
  }

  return (
    <main className="min-h-screen">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href={`/events/${slug}`}
          className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t("backToEvent")}</span>
        </Link>

        {/* Header with View Responses link */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold">{t("title")}</h1>
          </div>
          {questionnaire && responseCount > 0 && (
            <Link
              href={`/events/${slug}/responses`}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 rounded-lg transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              {t("viewResponses")}
            </Link>
          )}
        </div>
        <p className="text-muted-foreground text-sm mb-8">{event.title}</p>

        {/* Builder */}
        <QuestionnaireBuilder
          eventId={event.id}
          eventTitle={event.title}
          eventSlug={event.slug}
          questionnaireId={questionnaire?.id || null}
          isEnabled={questionnaire?.is_enabled ?? false}
          introText={questionnaire?.intro_text as MultilingualText | null}
          questions={questions}
          templates={(templates as QuestionTemplate[]) || []}
        />
      </div>
    </main>
  );
}
