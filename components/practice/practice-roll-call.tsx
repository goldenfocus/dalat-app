"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { PracticeView } from "@/lib/practice/model";
import { PracticePerson } from "./practice-person";

export function PracticeRollCall({ participants, busy, act }: {
  participants: NonNullable<PracticeView["participants"]>;
  busy: boolean;
  act: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const t = useTranslations("eventPractice");
  return <section aria-label={t("rollCall")} className="space-y-2">
    <p className="text-sm text-muted-foreground">{t("rollCallHint")}</p>
    <ul className="divide-y">
      {participants.map(person => <li key={person.id} className="flex items-center justify-between gap-3 py-2">
        <span className={person.presence === "absent" ? "min-w-0 opacity-50 line-through" : "min-w-0"}><PracticePerson person={person} number /></span>
        <div className="flex shrink-0 gap-1">
          <Button variant={person.presence === "present" ? "default" : "outline"} size="icon" className="h-11 w-11" disabled={busy} aria-pressed={person.presence === "present"} aria-label={t("confirmPresent", { name: person.name })} title={t("present")} onClick={() => void act({ action: "presence", participantId: person.id, status: "present" })}><Check aria-hidden className="h-5 w-5" /></Button>
          <Button variant="outline" size="icon" className={`h-11 w-11 ${person.presence === "absent" ? "border-destructive bg-destructive/10 text-destructive" : ""}`} disabled={busy} aria-pressed={person.presence === "absent"} aria-label={t("markAbsent", { name: person.name })} title={t("absent")} onClick={() => void act({ action: "presence", participantId: person.id, status: "absent" })}><X aria-hidden className="h-5 w-5" /></Button>
        </div>
      </li>)}
    </ul>
  </section>;
}
