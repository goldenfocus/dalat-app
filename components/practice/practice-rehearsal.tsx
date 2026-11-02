"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventPractice, type PracticeTransport } from "./event-practice";
import { createRehearsal, mutateRehearsal, rehearsalView } from "./rehearsal-model";
import { PracticeLanguage } from "./practice-language";

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
    <div className="practice-experience space-y-3">
      <PracticeLanguage />
      <div className="flex items-center gap-2">
        <details className="min-w-0 flex-1 text-xs text-muted-foreground"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5"><FlaskConical aria-hidden className="h-4 w-4" />{t("rehearsalSample")}</summary><p className="py-2 text-sm">{t("rehearsalHint")}</p></details>
        <label><span className="sr-only">{t("rehearsalScenario")}</span><select className="min-h-11 w-20 rounded-lg border border-border/60 bg-card/60 px-2 text-sm" value={count} onChange={event => reset(Number(event.target.value))}><option value={10}>10</option><option value={34}>34</option></select></label>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={t("rehearsalReset")} title={t("rehearsalReset")} onClick={() => reset()}><RotateCcw aria-hidden className="h-4 w-4" /></Button>
      </div>
      <div className="flex gap-1 border-b border-border/60" role="group" aria-label={t("rehearsalView")}>{([['host', 'rehearsalHost'], ['attendee', 'rehearsalAttendee']] as const).map(([value, key]) => <button type="button" key={value} aria-pressed={mode === value} className={`min-h-11 flex-1 border-b-2 px-3 text-sm font-semibold ${mode === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`} onClick={() => { session.current.mode = value; setMode(value); setVersion(v => v + 1); }}>{t(key)}</button>)}</div>
    </div>
    <EventPractice key={`${version}-${mode}`} slug="sample-rehearsal" transport={transport} />
  </>;
}
