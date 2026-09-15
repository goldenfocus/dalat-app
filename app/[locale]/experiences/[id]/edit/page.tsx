import { liveConversationSchema } from "@/lib/experiences/live-schema";
import { notFound } from "next/navigation";
import { getMessages } from "next-intl/server";
import { saveSchema, storySchema } from "@/lib/experiences/schema";
import { ownerExperience } from "@/lib/experiences/server";
import { ExperienceEditor } from "@/components/experiences/editor";
import type en from "@/messages/en.json";
import type { Locale } from "@/lib/i18n/routing";
export const metadata = { robots: { index: false, follow: false } };
export default async function EditExperience({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const [owned, messages] = await Promise.all([
    ownerExperience(id),
    getMessages(),
  ]);
  if (!owned) notFound();
  const [{ data: source }, { data: media }, { data: profile }] =
    await Promise.all([
      owned.db
        .from("experience_sources")
        .select(
          "notes,transcript,optional_question,generation,live_conversation",
        )
        .eq("experience_id", id)
        .single(),
      owned.db
        .from("experience_media")
        .select("id,kind,mime,preview_path,capture_mode")
        .eq("experience_id", id)
        .order("created_at"),
      owned.db
        .from("profiles")
        .select("username")
        .eq("id", owned.user.id)
        .maybeSingle(),
    ]);
  const suggestion = storySchema.safeParse(source?.generation?.story);
  return (
    <ExperienceEditor
      liveAvailable={
        !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY)?.trim()
      }
      aiAvailable={!!process.env.OPENROUTER_API_KEY?.trim()}
      initial={{
        username: profile?.username || null,
        story: saveSchema.parse(owned.experience),
        notes: source?.notes || "",
        transcript: source?.transcript || "",
        question: source?.optional_question || "",
        suggestion: suggestion.success ? suggestion.data : null,
        media: media || [],
        published: owned.experience.status === "published",
        photoHints: source?.generation?.photoHints,
        conversation:
          liveConversationSchema.safeParse(source?.live_conversation).data ||
          [],
      }}
      id={id}
      userId={owned.user.id}
      locale={locale as Locale}
      labels={messages.experiences as typeof en.experiences}
    />
  );
}
