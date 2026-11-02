"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, CirclePause, CirclePlay } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PracticeView } from "@/lib/practice/model";

export function PracticeParticipation({ view, busy, act }: { view: PracticeView; busy: boolean; act: (payload: Record<string, unknown>) => Promise<void> }) {
  const t = useTranslations("eventPractice");
  const [open, setOpen] = useState(false);
  const active = Boolean(view.round && !view.round.endedAt);
  const queued = active && !view.myGroup?.length;
  const playing = view.participation === "playing";
  const label = playing && queued ? "playingNext" : view.participation || "visiting";
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" disabled={busy} className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground" aria-label={t("changeParticipation", { status: t(label) })}>
      {playing ? <CirclePlay aria-hidden className="h-4 w-4" /> : <CirclePause aria-hidden className="h-4 w-4" />}{t(label)}<ChevronDown aria-hidden className="h-3.5 w-3.5" />
    </button></PopoverTrigger>
    <PopoverContent align="end" className="practice-experience w-64 p-2">
      {(["playing", view.canStart ? "hosting" : "visiting"] as const).map(status => <button type="button" key={status} disabled={busy} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-lg px-3 text-left font-medium hover:bg-accent" onClick={() => { setOpen(false); void act({ action: "participation", status }); }}>
        {t(status === "playing" && queued ? "playNext" : status === "playing" ? "playing" : active ? "sitOutNext" : status)}{view.participation === status && <Check aria-hidden className="h-4 w-4" />}
      </button>)}
    </PopoverContent>
  </Popover>;
}
