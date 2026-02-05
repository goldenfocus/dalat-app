import { createClient as createServerClient } from "@/lib/supabase/server";
import type { QuestionnaireData, ResolvedQuestion } from "@/lib/types";

/**
 * Fetch questionnaire data for an event (server-side)
 */
export async function getEventQuestionnaireServer(
  eventId: string
): Promise<QuestionnaireData | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc("get_event_questionnaire", {
    p_event_id: eventId,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  const result = data[0];

  // Parse questions if they exist
  const questions: ResolvedQuestion[] = Array.isArray(result.questions)
    ? result.questions.map((q: ResolvedQuestion) => ({
        id: q.id,
        template_id: q.template_id,
        sort_order: q.sort_order,
        question_type: q.question_type,
        question_text: q.question_text,
        description_text: q.description_text,
        options: q.options,
        is_required: q.is_required,
      }))
    : [];

  return {
    questionnaire_id: result.questionnaire_id,
    is_enabled: result.is_enabled,
    intro_text: result.intro_text,
    questions,
  };
}
