import { createClient } from "@/lib/supabase/client";
import type { QuestionnaireData, ResolvedQuestion } from "@/lib/types";

/**
 * Fetch questionnaire data for an event (client-side)
 */
export async function getEventQuestionnaire(
  eventId: string
): Promise<QuestionnaireData | null> {
  const supabase = createClient();

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

/**
 * Submit questionnaire responses along with RSVP
 */
export async function submitQuestionnaireResponses(
  rsvpId: string,
  responses: Record<string, string | string[]>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // Convert responses to array of row inserts
  const responseRows = Object.entries(responses)
    .filter(([, value]) => {
      // Skip empty responses
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined && value !== "";
    })
    .map(([questionId, responseValue]) => ({
      rsvp_id: rsvpId,
      question_id: questionId,
      response_value: responseValue,
    }));

  if (responseRows.length === 0) {
    return { success: true };
  }

  const { error } = await supabase
    .from("rsvp_responses")
    .upsert(responseRows, {
      onConflict: "rsvp_id,question_id",
    });

  if (error) {
    console.error("Failed to submit questionnaire responses:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Check if user has already completed questionnaire for an RSVP
 */
export async function hasCompletedQuestionnaire(
  rsvpId: string
): Promise<boolean> {
  const supabase = createClient();

  const { count, error } = await supabase
    .from("rsvp_responses")
    .select("*", { count: "exact", head: true })
    .eq("rsvp_id", rsvpId);

  if (error) {
    console.error("Failed to check questionnaire completion:", error);
    return false;
  }

  return (count ?? 0) > 0;
}
