"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PracticeView } from "@/lib/practice/model";
import { PracticePerson } from "./practice-person";

export function PracticeCheckIn({ view, busy, act }: { view: PracticeView; busy: boolean; act: (payload: Record<string, unknown>) => Promise<void> }) {
  const t = useTranslations("eventPractice");
  const [query, setQuery] = useState("");
  const people = (view.participants || []).filter(p => p.participation === "playing");
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLocaleLowerCase();
  const shown = people.filter(p => normalize(p.name).includes(normalize(query.trim().replace(/^@/, ""))));
  return <div className="space-y-4">
    <p className="text-sm tabular-nums text-muted-foreground" role="status">{t("rollCallProgress", { checked: view.count, total: people.length })}</p>
    <label className="relative block"><span className="sr-only">{t("findGuest")}</span><Search aria-hidden className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("findGuest")} className="min-h-12 w-full rounded-lg border bg-background pl-10 pr-3" /></label>
    <ul className="divide-y divide-border/60">{shown.map(person => <li key={person.id} className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1"><PracticePerson person={person} /></div>
      {person.presence === "present" ? <>
        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Check aria-hidden className="h-4 w-4" />{t("checkedIn")}</span>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={busy} aria-label={t("markAbsent", {name:person.name})} onClick={() => void act({action:"presence",participantId:person.id,status:"absent"})}><X aria-hidden className="h-4 w-4" /></Button>
      </> : <Button type="button" variant="outline" disabled={busy} className="min-h-12 shrink-0" aria-label={t("confirmPresent", {name:person.name})} onClick={() => void act({action:"presence",participantId:person.id,status:"present"})}>{t("checkIn")}</Button>}
    </li>)}</ul>
  </div>;
}
