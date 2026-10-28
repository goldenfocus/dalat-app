"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Play, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewer } from "@/lib/hooks/use-viewer";
import type { PracticeView } from "@/lib/practice/model";

export function EventPractice({ slug }: { slug: string }) {
  const t = useTranslations("eventPractice");
  const { profile } = useViewer();
  const [view, setView] = useState<PracticeView | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [minutes, setMinutes] = useState(10);
  const [prompt, setPrompt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const fetching = useRef(false);
  const mutation = useRef(0);
  const endpoint = `/api/events/${encodeURIComponent(slug)}/practice`;
  const load = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    const revision = mutation.current;
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("load");
      const next = await response.json() as PracticeView;
      if (revision === mutation.current) { setView(next); setError(false); }
    } catch { if (revision === mutation.current) setError(true); }
    finally { fetching.current = false; }
  }, [endpoint]);
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
  async function start() {
    if (!view || busy) return;
    mutation.current++;
    setBusy(true); setError(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ expectedRound: view.round?.number || 0, minutes }),
      });
      if (!response.ok) throw new Error("start");
      mutation.current++;
      setView(await response.json() as PracticeView);
      setPrompt(0);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  async function findPartner(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    mutation.current++;
    setBusy(true); setCodeError(false);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "find", code: code.trim() }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("code");
      mutation.current++;
      setView(await response.json() as PracticeView);
      setCode(""); setError(false);
    } catch { setCodeError(true); }
    finally { setBusy(false); }
  }
  const remaining = view?.round ? Math.max(0, view.round.minutes * 60 - Math.floor((now - Date.parse(view.round.startedAt)) / 1000)) : 0;
  return <section id="practice" className="my-5 scroll-mt-20 space-y-4 rounded-xl border border-primary/30 bg-card p-4 sm:p-6">
    <h2 className="flex items-center gap-3 text-2xl font-bold"><Users aria-hidden className="h-6 w-6 shrink-0 text-primary" />{t(view?.me ? "yourPartner" : view?.canStart ? "title" : "findPartner")}</h2>
    {!view && <p role="status">{t("loading")}</p>}
    {view && !view.me && !view.canStart && <form onSubmit={event => void findPartner(event)} className="space-y-3">
      <p>{t("findHint")}</p>
      <label className="block space-y-2"><span className="font-medium">{t("code")}</span><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={8} pattern="[a-fA-F0-9]{8}" required className="min-h-12 w-full rounded-lg border bg-background px-3 text-base tracking-widest" /></label>
      <Button type="submit" className="min-h-12 w-full" disabled={busy || code.trim().length !== 8}>{t("find")}</Button>
      <p className="text-sm text-muted-foreground">{t("askHost")}</p>
      {codeError && <p role="alert">{t("codeError")}</p>}
    </form>}
    {view?.me && <div className="space-y-3" aria-live="polite">
      <p className="text-muted-foreground">{t("you", { name: view.me.name })}</p>
      {view.myGroup?.length ? <>
        <p className="break-words text-3xl font-bold leading-tight">{view.myGroup.filter(person => person.id !== view.me?.id).map(person => person.name).join(" + ")}</p>
        <p className="font-medium">{t("group", { number: view.myGroupNumber || 1 })}</p>
        <p>{t("where")}</p>
      </> : <p className="font-medium" role="status">{t(view.round ? "nextWaiting" : "waiting")}</p>}
    </div>}
    {view?.canStart && <>
      <p className="text-sm text-muted-foreground">{t("ready", { count: view.count })}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">{t("duration")}<select className="ml-2 min-h-12 rounded-lg border bg-background px-3 text-base" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
          {[10, 15, 20, 25, 30].map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <Button className="min-h-12" disabled={busy || view.count < 2} onClick={() => void start()}><Play aria-hidden className="mr-2 h-4 w-4" />{t(busy ? "starting" : view.round ? "nextRound" : "start")}</Button>
      </div>
      {view.count < 2 && <p className="text-sm text-muted-foreground">{t("needTwo")}</p>}
    </>}
    {error && <div role="alert" className="space-y-2"><p>{t("error")}</p><Button variant="outline" className="min-h-11" onClick={() => void load()}><RefreshCw aria-hidden className="mr-2 h-4 w-4" />{t("refresh")}</Button></div>}
    {view?.round && (view.canStart || view.me) ? <>
      <p className="font-medium" role="status">{t("round", { number: view.round.number })} · {remaining ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : t("timeUp")}</p>
      {view.canStart && <details open={!view.me}><summary className="min-h-11 cursor-pointer py-2 font-medium">{t("allGroups", { count: view.groups.length })}</summary><ul className="divide-y">{view.groups.map((group, index) => <li key={group.map(p => p.id).join(":")} className="py-3">
        <p className="text-sm text-muted-foreground">{t("group", { number: index + 1 })}</p><p className="text-lg font-semibold">{group.map(p => p.name).join(" + ")}</p>
      </li>)}</ul></details>}
      <div className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">{t("practice")}</h3>
        <p>{t(`prompt${prompt % 3}`)}</p>
        <p className="font-medium" lang="vi">{["Chào bạn, mình tên là ___. Bạn đến từ đâu?", "Cho mình một ly cà phê nhé. Bao nhiêu tiền?", "Bạn thích điều gì ở Đà Lạt?"][prompt % 3]}</p>
        <p className="text-sm text-muted-foreground" lang="en">{["Hi, my name is ___. Where are you from?", "I'd like a coffee, please. How much is it?", "What do you like about Đà Lạt?"][prompt % 3]}</p>
        <p className="text-sm text-muted-foreground">{t("swap")}</p>
        <Button variant="outline" className="min-h-11" onClick={() => setPrompt(p => p + 1)}>{t("nextPrompt")}</Button>
      </div>
    </> : null}
  </section>;
}
