"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronDown, Languages, Play, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasMixedLanguagePair, type PracticeView } from "@/lib/practice/model";
import { PracticePerson } from "./practice-person";
import { PracticeCards } from "./practice-cards";
import { PracticeParticipation } from "./practice-participation";

export function PracticeGuest({
  view,
  busy,
  act,
  readOnly = false,
  onProfile,
  remaining = 0,
  gameKey,
}: {
  view: PracticeView;
  busy: boolean;
  act: (payload: Record<string, unknown>) => Promise<void>;
  readOnly?: boolean;
  onProfile?: () => void;
  remaining?: number;
  gameKey?: string;
}) {
  const t = useTranslations("eventPractice");
  const [playing, setPlaying] = useState(false),
    [details, setDetails] = useState(false);
  if (!view.me) return null;
  const table = view.myTable,
    group = view.myGroup || [];
  const present = group.filter(person => person.presence === "present" || (person.presence !== "absent" && person.arrived));
  const ready = !!table && hasMixedLanguagePair(present);
  const seed = (table?.tableNumber || 0) * 31 + (view.round?.number || 0);
  return (
    <div className={`practice-guest ${playing && ready ? "practice-playing" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="w-11">
          {onProfile && !readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              aria-label={t("languageLabel")}
              onClick={onProfile}
            >
              <Languages aria-hidden className="h-4 w-4" />
            </Button>
          )}
        </div>
        {
          <button
            type="button"
            className="practice-seat-chip"
            aria-label={
              table
                ? `${t("table", { number: table.tableNumber })}, ${t(table.floor)}`
                : t("settings")
            }
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            {!(playing && ready) && table && (
              <>
                <strong>{t("table", { number: table.tableNumber })}</strong>
                <span className="flex items-center text-xs text-muted-foreground">
                  {table.floor === "upstairs" ? (
                    <ArrowUp aria-hidden className="h-3 w-3" />
                  ) : (
                    <ArrowDown aria-hidden className="h-3 w-3" />
                  )}
                  {table.floor === "upstairs" ? 2 : 1}
                </span>
              </>
            )}
            <ChevronDown aria-hidden className="h-4 w-4" />
          </button>
        }
        <div className="w-11" />
      </div>
      {details && (
        <div className="practice-seat-detail">
          {!readOnly && (
            <PracticeParticipation view={view} busy={busy} act={act} />
          )}
          <p>
            {table && t("table", { number: table.tableNumber })} ·{" "}
            {table && t(table.floor)}
          </p>
          <div className="mt-3 grid gap-3">
            {group.map((person) => (
              <PracticePerson key={person.id} person={person} showSpeaks />
            ))}
          </div>
        </div>
      )}
      {view.round && (
        <p
          className="text-center text-xs tabular-nums text-muted-foreground"
          role="timer"
          aria-label={t("timer")}
        >
          {view.round.endedAt || remaining <= 0
            ? t("roundComplete")
            : view.round.pausedAt
              ? t("paused")
              : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
        </p>
      )}
      {playing && ready ? (
        <div className="relative isolate pt-7">
          {table && (
            <span aria-hidden className="practice-watermark">
              {table.tableNumber}
            </span>
          )}
          <PracticeCards
            key={seed}
            seed={seed}
            people={present}
            storageKey={gameKey ? `${gameKey}:${seed}` : undefined}
          />
        </div>
      ) : (
        <>
          {!readOnly && view.presence !== "present" && (
            <Button
              disabled={busy}
              className="practice-primary mt-6 min-h-12 w-full"
              onClick={() => void act({ action: "arrive" })}
            >
              {t("arriveNow")}
            </Button>
          )}
          {ready ? <div className="flex justify-center py-9">
            <button
              type="button"
              className="practice-play disabled:opacity-40"
              disabled={!ready}
              aria-label={t("playCards")}
              onClick={() => setPlaying(true)}
            >
              <Play aria-hidden />
              <span>{t("playCards")}</span>
            </button>
          </div> : <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />{t(table ? "waitingPartner" : "findingTable")}</p>}
          <div className="grid grid-cols-2 gap-4">
            {group.map((person) => (
              <PracticePerson key={person.id} person={person} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
