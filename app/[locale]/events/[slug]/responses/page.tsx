import { notFound, redirect } from "next/navigation";
import { BarChart3, ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { ResponseDashboard } from "@/components/events/response-dashboard";
import type { MultilingualText, QuestionOption } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface QuestionResponse {
  question_id: string;
  question_text: MultilingualText;
  question_type: "single_choice" | "multi_choice" | "text";
  options: QuestionOption[] | null;
  responses: {
    user_id: string;
    user_name: string;
    user_avatar: string | null;
    value: string | string[];
    created_at: string;
  }[];
}

export default async function ResponsesPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const t = await getTranslations("responseDashboard");

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

  // Check if user is the creator
  if (event.created_by !== user.id) {
    redirect(`/events/${slug}`);
  }

  // Fetch questionnaire
  const { data: questionnaire } = await supabase
    .from("event_questionnaires")
    .select("id")
    .eq("event_id", event.id)
    .single();

  if (!questionnaire) {
    redirect(`/events/${slug}/questionnaire`);
  }

  // Get total RSVP count (going status)
  const { count: totalRsvps } = await supabase
    .from("rsvps")
    .select("*", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("status", "going");

  // Fetch questions with their responses using the RPC function
  const { data: fullResponses } = await supabase.rpc("get_questionnaire_responses_full", {
    p_event_id: event.id,
  });

  // Also fetch question details
  const { data: questionData } = await supabase
    .from("event_questions")
    .select(`
      id,
      template_id,
      sort_order,
      custom_question_type,
      custom_question_text,
      custom_options,
      question_templates (
        question_type,
        question_text,
        options
      )
    `)
    .eq("questionnaire_id", questionnaire.id)
    .order("sort_order", { ascending: true });

  // Build the questions with responses structure
  const questions: QuestionResponse[] = (questionData || []).map((q) => {
    const templateData = q.question_templates;
    const template = (Array.isArray(templateData) ? templateData[0] : templateData) as {
      question_type: "single_choice" | "multi_choice" | "text";
      question_text: MultilingualText;
      options: QuestionOption[] | null;
    } | null;

    const questionType = (template?.question_type || q.custom_question_type || "text") as "single_choice" | "multi_choice" | "text";
    const questionText = (template?.question_text || q.custom_question_text || {}) as MultilingualText;
    const options = (template?.options || q.custom_options) as QuestionOption[] | null;

    // Filter responses for this question
    const questionResponses = (fullResponses || [])
      .filter((r: { question_id: string }) => r.question_id === q.id)
      .map((r: {
        user_id: string;
        display_name: string | null;
        avatar_url: string | null;
        response_value: string | string[];
        created_at: string;
      }) => ({
        user_id: r.user_id,
        user_name: r.display_name || "Anonymous",
        user_avatar: r.avatar_url,
        value: r.response_value,
        created_at: r.created_at,
      }));

    return {
      question_id: q.id,
      question_text: questionText,
      question_type: questionType,
      options,
      responses: questionResponses,
    };
  });

  // Count unique users who responded
  const uniqueRespondents = new Set(
    (fullResponses || []).map((r: { user_id: string }) => r.user_id)
  ).size;

  return (
    <main className="min-h-screen">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href={`/events/${slug}/questionnaire`}
          className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t("backToQuestions")}</span>
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="w-6 h-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-8">{event.title}</p>

        {/* Dashboard */}
        <ResponseDashboard
          eventTitle={event.title}
          totalResponses={uniqueRespondents}
          totalRsvps={totalRsvps || 0}
          questions={questions}
        />
      </div>
    </main>
  );
}
