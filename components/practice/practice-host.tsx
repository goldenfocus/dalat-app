"use client";

import { useState } from "react";
import { Check, LayoutGrid, Pause, Play, Plus, Settings2, Square, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DEFAULT_ROUND_MINUTES, type PracticeView } from "@/lib/practice/model";
import { PracticeDraft } from "./practice-draft";
import { PracticePerson } from "./practice-person";
import { PracticeParticipation } from "./practice-participation";
import { PracticeRollCall } from "./practice-roll-call";

type Props = { view: PracticeView; busy: boolean; remaining: number; changeoverRemaining: number; act: (payload: Record<string, unknown>) => Promise<void> };
export function PracticeHost({ view, busy, act, remaining, changeoverRemaining }: Props) {
  const t = useTranslations("eventPractice");
  const [minutes, setMinutes] = useState(DEFAULT_ROUND_MINUTES);
  const [availability, setAvailability] = useState<Record<number, boolean>>({});
  const [floorPolicy, setFloorPolicy] = useState<string | null>(null);
  const [tool, setTool] = useState<"settings" | "people" | "groups" | "presence" | null>(null);
  const activeRound = view.round && !view.round.endedAt;
  const draft = view.draft;
  const players = view.participants?.filter(person => person.participation === "playing") ?? [];
  const pending = players.filter(person => person.presence !== "present" && person.presence !== "absent").length;
  const draftedIds = new Set(draft?.groups.flat().map(person => person.id));
  const draftPending = players.some(person => draftedIds.has(person.id) && person.presence !== "present");
  const needsRollCall = (!view.round && !draft) || draftPending || (!draft && pending > 0);
  const showRollCall = Boolean(view.participants && (needsRollCall || tool === "presence"));
  const rollCallHeading = <><span>{t("rollCall")}</span><span className="text-xs font-normal text-muted-foreground">{t("rollCallProgress", { checked: players.length - pending, total: players.length })}</span></>;
  return <div className="space-y-4">
    {(!activeRound || remaining === 0 && !view.round?.pausedAt) && !draft && <Button className="practice-primary min-h-12 w-full" disabled={busy || view.count < 2} onClick={() => void act({ action: "startGame", minutes }).then(() => setTool("groups"))}>{t("startGame")}</Button>}
    <div className="flex items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground" role="status"><Users aria-hidden className="h-4 w-4" />{t("ready", { count: view.count })}{!activeRound && <span className="text-xs">· {t("minutesShort", { count: draft?.minutes ?? minutes })}</span>}</p>
      {view.me && <PracticeParticipation view={view} busy={busy} act={act} />}
    </div>
    {activeRound && <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border/60 py-2">
      <div><p className="text-xs text-muted-foreground">{t("round", { number: view.round!.number })}{view.round!.pausedAt && ` · ${t("paused")}`}</p><p role="timer" aria-label={t("timer")} className="text-3xl font-semibold tracking-tight tabular-nums">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p></div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-11 w-11" disabled={busy || !remaining} aria-label={t(view.round!.pausedAt ? "resume" : "pause")} title={t(view.round!.pausedAt ? "resume" : "pause")} onClick={() => void act({ action: view.round!.pausedAt ? "resume" : "pause" })}>{view.round!.pausedAt ? <Play aria-hidden className="h-5 w-5" /> : <Pause aria-hidden className="h-5 w-5" />}</Button>
        <Button variant="ghost" className="h-11 gap-1 px-2" disabled={busy} aria-label={t("extend")} title={t("extend")} onClick={() => void act({ action: "extend", seconds: 120 })}><Plus aria-hidden className="h-4 w-4" /><span className="tabular-nums">2</span></Button>
        <Button variant="ghost" size="icon" className="h-11 w-11" disabled={busy} aria-label={t("end")} title={t("end")} onClick={() => void act({ action: "end" })}><Square aria-hidden className="h-4 w-4" /></Button>
      </div>
    </div>}
    {!activeRound && changeoverRemaining > 0 && <p className="flex items-center justify-between text-sm text-muted-foreground">{t("changeoverShort")}<span className="font-medium tabular-nums">{Math.floor(changeoverRemaining / 60)}:{String(changeoverRemaining % 60).padStart(2, "0")}</span></p>}
    {view.participants && players.length > 0 && <div className="space-y-2">
      {needsRollCall ? <h3 className="flex min-h-11 items-center justify-between gap-2 text-sm font-semibold">{rollCallHeading}</h3> : <button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-semibold" aria-expanded={showRollCall} onClick={() => setTool(showRollCall ? null : "presence")}>{rollCallHeading}</button>}
      {showRollCall && <PracticeRollCall participants={players} busy={busy} act={act} />}
    </div>}
    {draft ? <PracticeDraft key={draft.id} draft={draft} busy={busy} locked={Boolean(draftPending || activeRound && (remaining > 0 || view.round?.pausedAt))} act={act} redraft={() => void act({ action: "draft", minutes })} /> : <Button variant="outline" className="min-h-12 w-full" disabled={busy || view.count < 2} onClick={() => void act({ action: "draft", minutes })}>{t(view.round ? "draftNext" : "draft")}</Button>}
    {view.count < 2 ? <p className="text-sm text-muted-foreground">{t("needTwo")}</p> : !draft && pending > 0 && <p className="text-sm text-muted-foreground">{t("presenceHint")}</p>}
    <div className="flex items-center gap-1 border-t border-border/60 pt-1">
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={t("settings")} title={t("settings")} aria-expanded={tool === "settings"} onClick={() => setTool(tool === "settings" ? null : "settings")}><Settings2 aria-hidden className="h-4 w-4" /></Button>
      {view.participants && <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={t("hostParticipants")} title={t("hostParticipants")} aria-expanded={tool === "people"} onClick={() => setTool(tool === "people" ? null : "people")}><Users aria-hidden className="h-4 w-4" /></Button>}
      {view.round && <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={t("allGroups", { count: view.groups.length })} title={t("allGroups", { count: view.groups.length })} aria-expanded={tool === "groups"} onClick={() => setTool(tool === "groups" ? null : "groups")}><LayoutGrid aria-hidden className="h-4 w-4" /></Button>}
    </div>
    {tool === "settings" && <section aria-label={t("settings")}>
      <div className="space-y-4 py-3">

        <label className="block space-y-2"><span>{t("duration")}</span><select className="min-h-12 w-full rounded-lg border bg-background px-3" value={minutes} onChange={event => setMinutes(Number(event.target.value))}>{[5, 10, 12, 15, 20, 25, 30].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="block space-y-2"><span>{t("floorPolicy")}</span><select className="min-h-12 w-full rounded-lg border bg-background px-3" value={floorPolicy ?? view.floorPolicy} disabled={busy} onChange={event => setFloorPolicy(event.target.value)}>{[["balanced", "balanced"], ["downstairs", "preferDownstairs"], ["upstairs", "preferUpstairs"]].map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
        <fieldset className="space-y-2"><legend className="font-medium">{t("availableTables")}</legend><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{(view.tables ?? []).map(table => <label key={table.number} className="flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={availability[table.number] ?? table.available} disabled={busy} onChange={event => setAvailability(previous => ({ ...previous, [table.number]: event.target.checked }))} /><span>{t("table", { number: table.number })} · {t(table.floor)}<span className="block text-muted-foreground">{t("tableSeat", { count: table.capacity })}</span></span></label>)}</div></fieldset>
        <Button variant="outline" className="min-h-12 w-full gap-2" disabled={busy} onClick={async () => { await act({ action: "settings", floorPolicy: floorPolicy ?? view.floorPolicy, tables: (view.tables ?? []).map(table => ({ ...table, available: availability[table.number] ?? table.available })) }); setAvailability({}); setFloorPolicy(null); setTool(null); }}><Check aria-hidden className="h-4 w-4" />{t("saveSettings")}</Button>
      </div>
    </section>}
    {tool === "people" && view.participants && <section aria-label={t("hostParticipants")}><ul className="divide-y">{view.participants.map(person => <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><PracticePerson person={person} number /><label><span className="sr-only">{person.name} · {t("participation")}</span><select className="min-h-12 max-w-full rounded-lg border bg-background px-3" disabled={busy} value={person.participation} onChange={event => void act({ action: "participation", participantId: person.id, status: event.target.value })}>{["playing", "visiting", "break", "hosting", "left"].map(status => <option key={status} value={status}>{t(status)}</option>)}</select></label></li>)}</ul></section>}
    {tool === "groups" && view.round && <section aria-label={t("allGroups", { count: view.groups.length })}><ul className="divide-y">{view.groups.map((group, index) => {
      const table = view.round?.assignments?.find(item => item.groupIndex === index);
      return <li key={group.map(person => person.id).join(":")} className="py-3"><p className="font-semibold">{table && `${t("table", { number: table.tableNumber })} · ${t(table.floor)} · `}{t("group", { number: index + 1 })}</p><p>{group.map(person => `${person.name}${person.number ? ` #${person.number}` : ""}`).join(" + ")}</p></li>;
    })}</ul></section>}
  </div>;
}
