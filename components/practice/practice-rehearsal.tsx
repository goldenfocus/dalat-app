"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventPractice, type PracticeTransport } from "./event-practice";
import { createRehearsal, mutateRehearsal, rehearsalView } from "./rehearsal-model";
import { RehearsalQr } from "./rehearsal-qr";
import { HostTabs } from "./host-tabs";
import { PracticeLanguage } from "./practice-language";

export function PracticeRehearsal() {
  const t = useTranslations("eventPractice");
  const session = useRef(createRehearsal(50));
  const [count, setCount] = useState(50);
  const [panel, setPanel] = useState<"checkIn" | "tables" | "guest">("checkIn");
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
  useEffect(() => {
    if (new URLSearchParams(location.search).get("guest") === "1") {
      session.current.mode = "attendee"; setPanel("guest"); setVersion(v=>v+1);
    }
  }, []);
  function openGuest() { session.current.mode="attendee";setPanel("guest");setVersion(v=>v+1); }
  function reset(nextCount = count, checkedIn = false) {
    session.current = createRehearsal(nextCount, checkedIn);
    setPanel(checkedIn ? "tables" : "checkIn");
    setCount(nextCount); setVersion(v => v + 1);
  }
  return <>
    <div className="practice-experience space-y-3">
      <PracticeLanguage />
      <div className="flex items-center gap-2">
        <details className="min-w-0 flex-1 text-xs text-muted-foreground"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5"><FlaskConical aria-hidden className="h-4 w-4" />{t("rehearsalSample")}</summary><p className="py-2 text-sm">{t("rehearsalHint")}</p><Button variant="outline" className="mb-3 min-h-11" onClick={() => reset(count, true)}>{t("rehearsalCheckInAll")}</Button></details>
        <label><span className="sr-only">{t("rehearsalScenario")}</span><select className="min-h-11 w-20 rounded-lg border border-border/60 bg-card/60 px-2 text-sm" value={count} onChange={event => reset(Number(event.target.value))}><option value={10}>10</option><option value={34}>34</option><option value={50}>50</option></select></label>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={t("rehearsalReset")} title={t("rehearsalReset")} onClick={() => reset()}><RotateCcw aria-hidden className="h-4 w-4" /></Button>
      </div>
    </div>
    <HostTabs value={panel} label={t("rehearsalView")} items={[{value:"checkIn",label:t("checkInTab")},{value:"tables",label:t("tablesTab")},{value:"guest",label:t("previewGuest")}]} onChange={next => {session.current.mode=next === "guest" ? "attendee" : "host";setPanel(next);setVersion(v=>v+1);}}>
      {panel === "checkIn" && <RehearsalQr onGuest={openGuest} />}
      <EventPractice key={`${version}-${panel}`} slug="sample-rehearsal" transport={transport} hostPanel={panel === "checkIn" ? "checkIn" : "tables"} />
    </HostTabs>
  </>;
}
