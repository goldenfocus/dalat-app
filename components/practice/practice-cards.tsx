"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { tableTurn } from "@/lib/practice/cards";
import { PRACTICE_AUDIO } from "@/lib/practice/audio";
import type { Person } from "@/lib/practice/model";

function Player({ person, active = false }: { person: Person; active?: boolean }) {
  return <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
    <Avatar className={`h-16 w-16 border-2 ${active ? "border-primary" : "border-transparent"}`}>
      <AvatarImage src={person.avatarUrl || undefined} alt="" />
      <AvatarFallback>{person.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("")}</AvatarFallback>
    </Avatar>
    <span className={`max-w-full break-words text-center text-lg ${active ? "font-semibold" : ""}`}>{person.name}</span>
  </div>;
}

/** One shared phone per table. Only the turn position is saved on this device. */
export function PracticeCards({ seed = 0, people = [], storageKey }: { seed?: number; people?: Person[]; storageKey?: string }) {
  const t = useTranslations("eventPractice");
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    try {
      const saved = storageKey ? Number(localStorage.getItem(storageKey)) : 0;
      setStep(Number.isSafeInteger(saved) && saved >= 0 ? saved : 0);
    } catch { /* Storage can be disabled; the game still runs. */ }
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (ready && storageKey) { try { localStorage.setItem(storageKey, String(step)); } catch { /* Optional persistence. */ } }
  }, [ready, storageKey, step]);
  useEffect(() => () => { audio.current?.pause(); }, []);
  const { speaker, partner, card } = tableTurn(people, step, seed);
  function stop() { audio.current?.pause(); audio.current = null; setPlaying(null); }
  function move(by: number) { stop(); setAudioError(false); setStep(current => Math.max(0, current + by)); }
  async function listen(language: "en" | "vi", text: string) {
    const key = `${language}:${text}`;
    if (playing === key) { stop(); return; }
    stop(); setAudioError(false);
    const player = new Audio(PRACTICE_AUDIO[key]);
    audio.current = player; setPlaying(key);
    player.onended = () => { if (audio.current === player) setPlaying(null); };
    player.onerror = () => { if (audio.current === player) { setPlaying(null); setAudioError(true); } };
    try { await player.play(); } catch { if (audio.current === player) { setPlaying(null); setAudioError(true); } }
  }
  return <section aria-label={t("cardsTitle")} className="space-y-7">
    {speaker && <div className="flex items-center justify-center gap-4" aria-label={t("turnPlayer", { name: speaker.name })}>
      <Player person={speaker} active />
      {partner && <><span aria-hidden className="text-sm text-muted-foreground">vs</span><Player person={partner} /></>}
    </div>}
    <div aria-live="polite" className="grid grid-cols-2 gap-5 py-3">
      {(["vi", "en"] as const).map(language => <div key={language} className="flex min-w-0 flex-col items-center gap-3 text-center">
        <p lang={language} className="flex-1 break-words text-2xl font-semibold leading-snug">{card[language]}</p>
        <Button type="button" variant="outline" className="min-h-12 min-w-12" aria-label={t("playAudio", { text: card[language] })} aria-pressed={playing === `${language}:${card[language]}`} onClick={() => void listen(language, card[language])}>
          {playing === `${language}:${card[language]}` ? <Square aria-hidden className="h-4 w-4" /> : <Play aria-hidden className="h-4 w-4" />}
        </Button>
      </div>)}
    </div>
    {audioError && <p role="status" className="text-center text-sm text-muted-foreground">{t("audioUnavailable")}</p>}
    <div className="grid grid-cols-[48px_1fr] gap-3">
      <Button type="button" variant="outline" className="min-h-12" disabled={step === 0} aria-label={t("cardsPrevious")} onClick={() => move(-1)}><ChevronLeft aria-hidden className="h-4 w-4" /></Button>
      <Button type="button" className="practice-primary min-h-16" aria-label={t("cardsNext")} onClick={() => move(1)}><ChevronRight aria-hidden className="h-5 w-5" /></Button>
    </div>
    <a href="https://ezviet.org" target="_blank" rel="noopener noreferrer" className="block py-2 text-center text-xs text-muted-foreground">{t("byEzviet")}</a>
  </section>;
}
