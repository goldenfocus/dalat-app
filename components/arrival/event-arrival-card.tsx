"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";

/** Refresh on return to the event, including cached navigation and browser back. */
export function EventArrivalCard({ slug }: { slug: string }) {
  const t = useTranslations("arrival");
  const [checkedIn, setCheckedIn] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const fetching = useRef(false);
  const load = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(slug)}/arrival/status`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("attendance");
      const data = await response.json() as { checkedIn: boolean };
      setCheckedIn(data.checkedIn); setFailed(false);
    } catch { setFailed(true); }
    finally { fetching.current = false; }
  }, [slug]);
  useEffect(() => {
    void load();
    const resume = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(resume, 10000);
    const events = ["focus", "online", "pageshow", "dalat:arrival-change"];
    events.forEach(name => window.addEventListener(name, resume));
    document.addEventListener("visibilitychange", resume);
    return () => { window.clearInterval(timer); events.forEach(name => window.removeEventListener(name, resume)); document.removeEventListener("visibilitychange", resume); };
  }, [load]);
  if (checkedIn === null) return <Button className="event-join-action min-h-12 w-full" disabled={!failed} onClick={() => void load()}>{t(failed ? "retry" : "loading")}</Button>;
  return <Button asChild variant={checkedIn ? "outline" : "default"} className={`${checkedIn ? "" : "event-join-action "}min-h-12 w-full`}>
    <Link href={`/events/${slug}/arrive`}>{checkedIn && <Check aria-hidden className="mr-2 h-4 w-4" />}{t(checkedIn ? "checkedIn" : "checkIn")}</Link>
  </Button>;
}
