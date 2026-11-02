"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { PracticeView } from "@/lib/practice/model";

type Props = { view: PracticeView; busy: boolean; remaining: number; changeoverRemaining: number; act: (payload: Record<string, unknown>) => Promise<void> };
export function PracticeHost({ view, busy, act, remaining, changeoverRemaining }: Props) {
  const t = useTranslations("eventPractice");
  const [minutes, setMinutes] = useState(12);
  const [availability, setAvailability] = useState<Record<number, boolean>>({});
  const [floorPolicy, setFloorPolicy] = useState<string | null>(null);
  const activeRound = view.round && !view.round.endedAt;
  const draft = view.draft;
  return <div className="space-y-4 border-t pt-4">
    <p className="font-semibold" role="status">{t("ready", { count: view.count })}</p>
    {activeRound && <div className="space-y-3">
      <p className="flex flex-wrap items-baseline justify-between gap-2"><span>{t("round", { number: view.round!.number })} · {t(view.round!.pausedAt ? "paused" : remaining ? "timer" : "roundComplete")}</span><span className="text-3xl font-bold tabular-nums">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span></p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11" disabled={busy || !remaining} onClick={() => void act({ action: view.round!.pausedAt ? "resume" : "pause" })}>{t(view.round!.pausedAt ? "resume" : "pause")}</Button>
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void act({ action: "extend", seconds: 120 })}>{t("extend")}</Button>
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void act({ action: "end" })}>{t("end")}</Button>
      </div>
    </div>}
    {!activeRound && changeoverRemaining > 0 && <p className="space-y-2"><span className="block text-sm">{t("changeover")}</span><strong className="text-3xl tabular-nums">{Math.floor(changeoverRemaining / 60)}:{String(changeoverRemaining % 60).padStart(2, "0")}</strong></p>}
    <Button className="min-h-12 w-full" disabled={busy || view.count < 2} onClick={() => void act({ action: "draft", minutes })}>{t(view.round ? "draftNext" : "draft")}</Button>
    {view.count < 2 && <p className="text-sm text-muted-foreground">{t("needTwo")}</p>}
    {draft ? <section className="space-y-3 rounded-lg border border-primary/30 p-3" aria-label={t("draftReview", { number: draft.round })}>
      <h3 className="text-lg font-bold">{t("draftReview", { number: draft.round })}</h3>
      <p className="text-sm text-muted-foreground">{t("draftHint")}</p>
      <ul className="divide-y">{draft.groups.map((group, index) => {
        const table = draft.assignments.find(item => item.groupIndex === index);
        return <li key={group.map(person => person.id).join(":")} className="py-3">
          <p className="font-semibold">{table && `${t("table", { number: table.tableNumber })} · ${t(table.floor)} · `}{t("group", { number: index + 1 })}</p>
          <p className="break-words">{group.map(person => `${person.name}${person.number ? ` #${person.number}` : ""}`).join(" + ")}</p>
        </li>;
      })}</ul>
      <Button className="min-h-12 w-full" disabled={busy || Boolean(activeRound && (remaining > 0 || view.round?.pausedAt))} onClick={() => void act({ action: "start", draftId: draft.id })}>{t("publish")}</Button>
    </section> : <p className="text-sm text-muted-foreground">{t("hostNoDraft")}</p>}
    <details>
      <summary className="min-h-11 cursor-pointer py-2 font-medium">{t("settings")}</summary>
      <div className="space-y-4 py-3">
        {view.round && <p className="text-sm text-muted-foreground">{t("currentAssignment")}</p>}
        <label className="block space-y-2"><span>{t("duration")}</span><select className="min-h-12 w-full rounded-lg border bg-background px-3" value={minutes} onChange={event => setMinutes(Number(event.target.value))}>{[5, 10, 12, 15, 20, 25, 30].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="block space-y-2"><span>{t("floorPolicy")}</span><select className="min-h-12 w-full rounded-lg border bg-background px-3" value={floorPolicy ?? view.floorPolicy} disabled={busy} onChange={event => setFloorPolicy(event.target.value)}>{[["balanced", "balanced"], ["downstairs", "preferDownstairs"], ["upstairs", "preferUpstairs"]].map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
        <fieldset className="space-y-2"><legend className="font-medium">{t("availableTables")}</legend><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{(view.tables ?? []).map(table => <label key={table.number} className="flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={availability[table.number] ?? table.available} disabled={busy} onChange={event => setAvailability(previous => ({ ...previous, [table.number]: event.target.checked }))} /><span>{t("table", { number: table.number })} · {t(table.floor)}<span className="block text-muted-foreground">{t("tableSeat", { count: table.capacity })}</span></span></label>)}</div></fieldset>
        <Button variant="outline" className="min-h-12 w-full" disabled={busy} onClick={async () => { await act({ action: "settings", floorPolicy: floorPolicy ?? view.floorPolicy, tables: (view.tables ?? []).map(table => ({ ...table, available: availability[table.number] ?? table.available })) }); setAvailability({}); setFloorPolicy(null); }}>{t("saveSettings")}</Button>
      </div>
    </details>
    {view.participants && <details><summary className="min-h-11 cursor-pointer py-2 font-medium">{t("hostParticipants")}</summary><ul className="divide-y">{view.participants.map(person => <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="font-medium">{person.name}{person.number ? ` #${person.number}` : ""}</span><label><span className="sr-only">{person.name} · {t("participation")}</span><select className="min-h-12 max-w-full rounded-lg border bg-background px-3" disabled={busy} value={person.participation} onChange={event => void act({ action: "participation", participantId: person.id, status: event.target.value })}>{["playing", "visiting", "break", "hosting", "left"].map(status => <option key={status} value={status}>{t(status)}</option>)}</select></label></li>)}</ul></details>}
    {view.round && <details><summary className="min-h-11 cursor-pointer py-2 font-medium">{t("allGroups", { count: view.groups.length })}</summary><ul className="divide-y">{view.groups.map((group, index) => {
      const table = view.round?.assignments?.find(item => item.groupIndex === index);
      return <li key={group.map(person => person.id).join(":")} className="py-3"><p className="font-semibold">{table && `${t("table", { number: table.tableNumber })} · ${t(table.floor)} · `}{t("group", { number: index + 1 })}</p><p>{group.map(person => `${person.name}${person.number ? ` #${person.number}` : ""}`).join(" + ")}</p></li>;
    })}</ul></details>}
  </div>;
}
