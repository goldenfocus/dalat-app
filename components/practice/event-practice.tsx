"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/i18n/routing";
import { useViewer } from "@/lib/hooks/use-viewer";
import type { PracticeView } from "@/lib/practice/model";
import { PracticeHost } from "./practice-host";
import { PracticeGuest } from "./practice-guest";
import { PracticeProfile } from "./practice-profile";
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
  const [showProfile, setShowProfile] = useState(false);
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
    mutation.current++;
    setView(null);
    setShowProfile(false);
  }, [slug, profile?.id]);
  useEffect(() => {
    const restoreTicket = () => {
      const ticket = new URLSearchParams(window.location.hash.slice(1)).get("ticket");
      if (!ticket || transport) return false;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      mutation.current++;
      void request({ action: "claim", token: ticket }).then(async response => {
        if (!response.ok) throw new Error("claim");
        accept(await response.json() as PracticeView);
      }).catch(() => setCodeError(true));
      return true;
    };
    if (!restoreTicket()) void load();
    window.addEventListener("hashchange", restoreTicket);
    window.addEventListener("popstate", restoreTicket);
    const resume = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(resume, 5000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("dalat:rsvp-change", resume);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    return () => {
      window.removeEventListener("hashchange", restoreTicket);
      window.removeEventListener("popstate", restoreTicket);
      window.removeEventListener("dalat:rsvp-change", resume);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, [load, profile?.id, request, accept, transport]);
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
        if (failure.code === "language_profile_required") { setShowProfile(true); return; }
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
  const issueTicket = useCallback(async (participantId: string) => {
    const response = await request({ action: "ticket", participantId });
    if (!response.ok) throw new Error("ticket");
    const { token } = await response.json();
    return `${window.location.origin}/events/${encodeURIComponent(slug)}/play#ticket=${encodeURIComponent(token)}`;
  }, [request, slug]);
  const remaining = remainingSeconds(view?.round ?? null, now + offset);
  const changeoverRemaining = view?.round?.changeoverEndsAt ? Math.max(0, Math.ceil((Date.parse(view.round.changeoverEndsAt) - now - offset) / 1000)) : 0;
  return <section id="practice" aria-labelledby="practice-heading" className="practice-experience practice-glass relative my-4 scroll-mt-24 space-y-4 p-4 sm:p-6">
    {!transport && <div className="flex justify-end"><PracticeLanguage /></div>}
    <h2 id="practice-heading" className="sr-only">{t(view?.me ? "yourPartner" : view?.canStart ? "title" : "findPartner")}</h2>
    {!view && <p role="status">{t("loading")}</p>}
    {view?.me && !view.canStart && <PracticeGuest view={view} busy={busy} act={act} remaining={remaining} onProfile={profile?.id ? () => setShowProfile(true) : undefined} />}
    {profile?.id && <PracticeProfile key={profile.id} open={showProfile} onClose={() => { setShowProfile(false); void load(); }} />}
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
    {view?.canStart && <PracticeHost view={view} ticket={issueTicket} busy={busy} act={act} remaining={remaining} changeoverRemaining={changeoverRemaining} />}
    {(error || actionError) && <div role="alert" className="flex items-center justify-between gap-2 text-sm"><p>{t(actionError ?? (view ? "stale" : "error"))}</p><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={t("refresh")} disabled={busy} onClick={() => void load()}><RefreshCw aria-hidden className="h-4 w-4" /></Button></div>}
  </section>;
}
