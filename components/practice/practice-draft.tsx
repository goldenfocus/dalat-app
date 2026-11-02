"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftRight, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Draft } from "@/lib/practice/model";
import { PracticePerson } from "./practice-person";

export function PracticeDraft({ draft, busy, locked, act, redraft }: { draft: Draft; busy: boolean; locked: boolean; act: (payload: Record<string, unknown>) => Promise<void>; redraft: () => void }) {
  const t = useTranslations("eventPractice");
  const [selected, setSelected] = useState<string | null>(null);
  const selectedPerson = draft.groups.flat().find(person => person.id === selected);
  function swap(first: string, second: string) {
    if (busy || first === second) { setSelected(null); return; }
    const firstGroup = draft.groups.findIndex(group => group.some(person => person.id === first));
    const secondGroup = draft.groups.findIndex(group => group.some(person => person.id === second));
    if (firstGroup === secondGroup) { setSelected(second); return; }
    void act({ action: "swap", draftId: draft.id, participantId: first, withParticipantId: second });
  }
  return <section aria-label={t("draftReview", { number: draft.round })} className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-semibold">{t("draftReview", { number: draft.round })}</h3>
      <Button variant="ghost" size="icon" className="h-11 w-11" disabled={busy} aria-label={t("redraft")} title={t("redraft")} onClick={redraft}><RotateCcw aria-hidden className="h-4 w-4" /></Button>
    </div>
    <div className="flex min-h-8 items-center gap-2 text-sm text-muted-foreground" role="status"><ArrowLeftRight aria-hidden className="h-4 w-4 shrink-0" />{selectedPerson ? t("swapWith", { name: selectedPerson.name }) : t("swapHint")}{selected && <button type="button" aria-label={t("cancelSwap")} className="ml-auto grid h-11 w-11 shrink-0 place-items-center" onClick={() => setSelected(null)}><X aria-hidden className="h-4 w-4" /></button>}</div>
    <ul className="divide-y divide-border/60">{draft.groups.map((group, index) => {
      const table = draft.assignments.find(item => item.groupIndex === index);
      return <li key={index} className="py-3">
        <p className="mb-2 flex items-baseline gap-2 text-sm"><span className="font-semibold">{table && t("table", { number: table.tableNumber })}</span><span className="text-xs text-muted-foreground">{table && t(table.floor)}</span></p>
        <div className="grid grid-cols-2 gap-2">{group.map(person => <button key={person.id} type="button" draggable={!busy} disabled={busy} aria-label={t("swapPerson", { name: person.name })} aria-pressed={selected === person.id}
          className={`min-h-12 min-w-0 rounded-xl p-1 text-left transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${selected === person.id ? "bg-accent ring-2 ring-primary" : ""}`}
          onClick={() => selected ? swap(selected, person.id) : setSelected(person.id)}
          onDragStart={event => { event.dataTransfer.setData("text/practice-person", person.id); event.dataTransfer.effectAllowed = "move"; setSelected(person.id); }}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
          onDrop={event => { event.preventDefault(); const source = event.dataTransfer.getData("text/practice-person"); if (source && draft.groups.some(g => g.some(p => p.id === source))) swap(source, person.id); }}><PracticePerson person={person} /></button>)}</div>
      </li>;
    })}</ul>
    <Button className="practice-primary min-h-12 w-full" disabled={busy || locked} onClick={() => void act({ action: "start", draftId: draft.id })}>{t("publish")}</Button>
  </section>;
}
