"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARD_LEVELS, cardsForLevel, cardStartOffset, type CardLevel } from "@/lib/practice/cards";

/** Read-aloud table cards. Local state only: no network, no microphone. */
export function PracticeCards({ seed = 0, initialLevel = 1 }: { seed?: number; initialLevel?: CardLevel }) {
  const t = useTranslations("eventPractice");
  const [level, setLevel] = useState<CardLevel>(initialLevel);
  const [step, setStep] = useState(0);
  const cards = cardsForLevel(level);
  // Offset by level too, so changing level does not always land on the same position.
  const card = cards[(cardStartOffset(seed + level, cards.length) + step) % cards.length];
  const lowest = CARD_LEVELS[0], highest = CARD_LEVELS[CARD_LEVELS.length - 1];
  const changeLevel = (next: number) => { setLevel(Math.min(highest, Math.max(lowest, next)) as CardLevel); setStep(0); };
  const move = (by: number) => setStep(current => (current + by + cards.length) % cards.length);
  return <section aria-labelledby="practice-cards-heading" className="space-y-3 border-t border-border/60 pt-4">
    <div>
      <h3 id="practice-cards-heading" className="text-base font-semibold">{t("cardsTitle")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("cardsHint")}</p>
    </div>
    <div aria-live="polite" className="space-y-5 rounded-md border border-border bg-background p-5">
      <p className="fog-cap tabular-nums text-muted-foreground">{t("cardsCounter", { current: step + 1, total: cards.length })}</p>
      <div>
        {/* Endonyms label the two languages for everyone at the table, whatever the interface locale. */}
        <p lang="vi" className="fog-cap text-muted-foreground">Tiếng Việt</p>
        <p lang="vi" className="mt-1 break-words text-2xl font-semibold leading-snug">{card.vi}</p>
      </div>
      <div>
        <p lang="en" className="fog-cap text-muted-foreground">English</p>
        <p lang="en" className="mt-1 break-words text-xl font-medium leading-snug">{card.en}</p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="outline" className="h-auto min-h-12 whitespace-normal" onClick={() => move(-1)}><ChevronLeft aria-hidden className="h-4 w-4 shrink-0" />{t("cardsPrevious")}</Button>
      <Button type="button" className="practice-primary h-auto min-h-12 whitespace-normal" onClick={() => move(1)}>{t("cardsNext")}<ChevronRight aria-hidden className="h-4 w-4 shrink-0" /></Button>
    </div>
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <Button type="button" variant="ghost" className="h-auto min-h-12 whitespace-normal" disabled={level === lowest} onClick={() => changeLevel(level - 1)}>{t("cardsEasier")}</Button>
      <p aria-live="polite" className="fog-cap px-1 text-center tabular-nums">{t("cardsLevel", { level })}</p>
      <Button type="button" variant="ghost" className="h-auto min-h-12 whitespace-normal" disabled={level === highest} onClick={() => changeLevel(level + 1)}>{t("cardsHarder")}</Button>
    </div>
  </section>;
}
