"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/i18n/routing";
import { useViewer } from "@/lib/hooks/use-viewer";
import type { PracticeView } from "@/lib/practice/model";
import { PracticeHost } from "./practice-host";
import { PracticePerson } from "./practice-person";
import { PracticeParticipation } from "./practice-participation";
import { PracticeLanguage } from "./practice-language";
import "./practice.css";

/** Uses server timestamps and a measured clock offset; pausing never advances locally. */
export function remainingSeconds(round: PracticeView["round"], now: number) {
  if (!round || round.endedAt) return 0;
  if (round.pausedAt) return Math.max(0, round.remainingSeconds ?? 0);
  const end = round.endsAt ? Date.parse(round.endsAt) : Date.parse(round.startedAt) + round.minutes * 60_000;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

export type PracticeTransport = (payload?: Record<string, unknown>) => Promise<Response>;

export function EventPractice({ slug, transport }: { slug: string; transport?: PracticeTransport }) {
  const t = useTranslations("eventPractice");
  const { profile } = useViewer();
  const [view, setView] = useState<PracticeView | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<"draftStale" | "notEnoughSeats" | "error" | null>(null);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const fetching = useRef(false);
  const mutation = useRef(0);
  const endpoint = `/api/events/${encodeURIComponent(slug)}/practice`;
  const request = useCallback((payload?: Record<string, unknown>) => transport ? transport(payload) : fetch(endpoint, {
    cache: "no-store", signal: AbortSignal.timeout(20000),
    ...(payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}),
  }), [endpoint, transport]);
  const accept = useCallback((next: PracticeView) => {
    setView(next); setError(false);
    const receivedAt = Date.now();
    setNow(receivedAt);
    if (next.serverNow) setOffset(Date.parse(next.serverNow) - receivedAt);
  }, []);
  const load = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    const revision = mutation.current;
    try {
      const response = await request();
      if (!response.ok) throw new Error("load");
      const next = await response.json() as PracticeView;
      if (revision === mutation.current) accept(next);
    } catch { if (revision === mutation.current) setError(true); }
    finally { fetching.current = false; }
  }, [request, accept]);
  useEffect(() => {
    void load();
    const resume = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(resume, 5000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, [load, profile?.id]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  async function act(payload: Record<string, unknown>) {
    if (!view || busy) return;
    mutation.current++;
    setBusy(true); setError(false); setActionError(null);
    try {
      const response = await request({ ...payload, expectedRevision: view.revision });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        setActionError(failure.code === "invalid_table_capacity" ? "notEnoughSeats" : response.status === 409 && ["start", "swap"].includes(String(payload.action)) ? "draftStale" : "error");
        void load();
        return;
      }
      mutation.current++;
      accept(await response.json() as PracticeView);
    } catch { setActionError("error"); void load(); }
    finally { setBusy(false); }
  }
  async function findPartner(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    mutation.current++;
    setBusy(true); setCodeError(false);
    try {
      const response = await request({ action: "find", code: code.trim() });
      if (!response.ok) throw new Error("code");
      mutation.current++;
      accept(await response.json() as PracticeView);
      setCode("");
    } catch { setCodeError(true); }
    finally { setBusy(false); }
  }
  const remaining = remainingSeconds(view?.round ?? null, now + offset);
  const complete = Boolean(view?.round && (view.round.endedAt || remaining === 0));
  const changeoverRemaining = view?.round?.changeoverEndsAt ? Math.max(0, Math.ceil((Date.parse(view.round.changeoverEndsAt) - now - offset) / 1000)) : 0;
  const partnerNames = view?.myGroup?.filter(person => person.id !== view.me?.id) ?? [];
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  const activityUrl = transport ? "https://ezviet.org/challenges?practice=1" : `https://ezviet.org/challenges?event=${encodeURIComponent(slug)}&practice=1`;
  const challengeUrl = transport ? "https://ezviet.org/challenges" : `https://ezviet.org/challenges?event=${encodeURIComponent(slug)}`;
  const assigned = Boolean(view?.myGroup?.length);
  return <section id="practice" aria-labelledby="practice-heading" className="practice-experience practice-glass my-4 scroll-mt-24 space-y-4 p-4 sm:p-6">
    {!transport && <PracticeLanguage />}
    <h2 id="practice-heading" className={view?.me || view?.canStart ? "sr-only" : "text-xl font-semibold"}>{t(view?.me ? "yourPartner" : view?.canStart ? "title" : "findPartner")}</h2>
    {!view && <p role="status">{t("loading")}</p>}
    {view?.me && <>
      {(!view.canStart || assigned) && <div className="flex items-start justify-between gap-3">
        <div>{view.myTable && assigned && <>
          <h3 className="text-3xl font-bold tracking-tight">{t("table", { number: view.myTable.tableNumber })}</h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">{view.myTable.floor === "upstairs" ? <ArrowUp aria-hidden className="h-3.5 w-3.5" /> : <ArrowDown aria-hidden className="h-3.5 w-3.5" />}{t(view.myTable.floor)}</p>
        </>}</div>
        {!view.canStart && <PracticeParticipation view={view} busy={busy} act={act} />}
      </div>}
      {assigned ? <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-1">{view.myGroup!.map(person => <PracticePerson key={person.id} person={person} />)}</div> : !view.canStart && <p role="status" className="py-3 text-lg font-medium">{t(view.participation === "playing" ? view.round ? "nextRoundShort" : "waitingShort" : "notPlayingShort")}</p>}
      {view.round && assigned && !view.canStart && <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <span className="text-sm text-muted-foreground">{t("round", { number: view.round.number })}{view.round.pausedAt && <span className="ml-2">{t("paused")}</span>}{!complete && remaining <= view.round.minutes * 30 && <span className="mt-1 block">{t("swapNow")}</span>}</span>
        <p aria-label={t("timer")} role="timer" className="text-3xl font-semibold tracking-tight tabular-nums">{complete ? "0:00" : clock}</p>
      </div>}
      {partnerNames.length > 0 && <a href={complete ? challengeUrl : activityUrl} className="practice-primary inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">{t(complete ? "challenge" : "openActivity")}</a>}
      {complete && partnerNames.length > 0 && changeoverRemaining > 0 && <p className="text-center text-sm text-muted-foreground">{t("changeoverShort")} · <span className="tabular-nums">{Math.floor(changeoverRemaining / 60)}:{String(changeoverRemaining % 60).padStart(2, "0")}</span></p>}
    </>}
    {view && !view.me && !view.canStart && <div className="space-y-2">
      <Button asChild className="practice-primary min-h-12 w-full"><Link href={`/events/${slug}/arrive`}>{t("arrival")}</Link></Button>
      <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-muted-foreground">{t("findHint")}</summary>
        <form onSubmit={event => void findPartner(event)} className="space-y-3 pt-2">
          <label className="block space-y-2"><span className="text-sm font-medium">{t("code")}</span><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={8} pattern="[a-fA-F0-9]{8}" required className="min-h-12 w-full rounded-lg border bg-background px-3 text-base tracking-widest" /></label>
          <Button type="submit" className="min-h-12 w-full" disabled={busy || code.trim().length !== 8}>{t("find")}</Button>
          {codeError && <p role="alert">{t("codeError")}</p>}
        </form>
      </details>
    </div>}
    {view?.canStart && <PracticeHost view={view} busy={busy} act={act} remaining={remaining} changeoverRemaining={changeoverRemaining} />}
    {(error || actionError) && <div role="alert" className="flex items-center justify-between gap-2 text-sm"><p>{t(actionError ?? (view ? "stale" : "error"))}</p><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={t("refresh")} disabled={busy} onClick={() => void load()}><RefreshCw aria-hidden className="h-4 w-4" /></Button></div>}
  </section>;
}
