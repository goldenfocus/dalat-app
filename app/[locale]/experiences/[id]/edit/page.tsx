import { notFound } from "next/navigation";
import { getMessages } from "next-intl/server";
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
  const owned = await ownerExperience(id);
  if (!owned) notFound();
  const messages = await getMessages();
  return (
    <ExperienceEditor
      aiAvailable={!!process.env.OPENROUTER_API_KEY?.trim()}
      id={id}
      userId={owned.user.id}
      locale={locale as Locale}
      labels={messages.experiences as typeof en.experiences}
    />
  );
}
