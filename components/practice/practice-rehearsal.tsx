"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EventPractice, type PracticeTransport } from "./event-practice";
import { createRehearsal, mutateRehearsal, rehearsalView } from "./rehearsal-model";

export function PracticeRehearsal() {
  const t = useTranslations("eventPractice");
  const session = useRef(createRehearsal());
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<"host" | "attendee">("host");
  const [version, setVersion] = useState(0);
  const transport: PracticeTransport = useCallback(async payload => {
    try {
      if (payload) session.current = mutateRehearsal(session.current, payload);
      return new Response(JSON.stringify(rehearsalView(session.current)), { status: 200 });
    } catch (error) {
      const code = error instanceof Error ? error.message : "unavailable";
      return new Response(JSON.stringify({ code }), { status: code === "status_conflict" ? 409 : 400 });
    }
  }, []);
  function reset(nextCount = count) {
    session.current = createRehearsal(nextCount);
    session.current.mode = mode;
    setCount(nextCount); setVersion(v => v + 1);
  }
  return <>
    <aside className="space-y-3 rounded-xl border-2 border-amber-500/60 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <p className="font-bold">{t("rehearsalSample")}</p>
      <p className="text-sm">{t("rehearsalHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium"><span className="block">{t("rehearsalScenario")}</span><select className="min-h-12 w-full rounded-lg border border-amber-700/30 bg-background px-3 text-foreground" value={count} onChange={event => reset(Number(event.target.value))}><option value={10}>{t("rehearsalSmall")}</option><option value={34}>{t("rehearsalLarge")}</option></select></label>
        <label className="space-y-1 text-sm font-medium"><span className="block">{t("rehearsalView")}</span><select className="min-h-12 w-full rounded-lg border border-amber-700/30 bg-background px-3 text-foreground" value={mode} onChange={event => { const next = event.target.value as "host" | "attendee"; session.current.mode = next; setMode(next); setVersion(v => v + 1); }}><option value="host">{t("rehearsalHost")}</option><option value="attendee">{t("rehearsalAttendee")}</option></select></label>
      </div>
      <Button variant="outline" className="min-h-11 bg-background text-foreground" onClick={() => reset()}>{t("rehearsalReset")}</Button>
    </aside>
    <EventPractice key={`${version}-${mode}`} slug="sample-rehearsal" transport={transport} />
    <p className="text-sm text-muted-foreground">{t("rehearsalSteps")}</p>
  </>;
}
