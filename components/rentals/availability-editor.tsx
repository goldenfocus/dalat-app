"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { addRentalAvailability, removeRentalAvailability, type AvailabilityFeedback } from "@/app/[locale]/rentals/actions";
import { availabilityTimes, dalatDate, dalatZone, dayKey, halfHour, weekDays } from "@/lib/rentals/calendar";

export type SavedViewingTime = {
  id: string;
  starts_at: string;
  visit_status: "pending" | "proposed" | "confirmed" | null;
};

export function AvailabilityEditor({ now, locale, savedTimes }: {
  now: number;
  locale: string;
  savedTimes: SavedViewingTime[] | null;
}) {
  const [week, setWeek] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [start, setStart] = useState(18);
  const [end, setEnd] = useState(34);
  const [showSaved, setShowSaved] = useState(false);
  const [feedback, submit, pending] = useActionState<AvailabilityFeedback, FormData>(async (_previous, form) => {
    if (form.has("removeSlot") || form.has("removeDay")) return removeRentalAvailability(form);

    const result = await addRentalAvailability(null, form);
    if (result === "saved") {
      setSelected([]);
      setExcluded([]);
      setShowSaved(true);
    }
    return result;
  }, null);
  const t = useTranslations("rentalsDetails");
  const common = useTranslations("common");
  const pilot = useTranslations("rentalsPilot");
  const today = dayKey(now);
  const dates = weekDays(today, week);
  const formatter = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, weekday: "short", day: "numeric" });
  const longer = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, weekday: "long", day: "numeric", month: "long" });
  const month = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, month: "long", year: "numeric" });
  const clock = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, hour: "numeric", minute: "2-digit" });
  const displayTime = (index: number) => clock.format(dalatDate(today).getTime() + index * halfHour);
  const dateLabel = (date: string) => longer.format(dalatDate(date));
  const removeLabel = (time: string) => t("removeAvailability", { time });
  const arrows = "grid size-11 place-items-center rounded-full border bg-background disabled:opacity-40";
  const control = "min-h-11 w-full rounded-xl border bg-background px-3 text-sm";
  const removeDay = "grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted disabled:opacity-40";
  const removeTime = "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 tabular-nums hover:bg-muted disabled:opacity-40";
  const omitted = new Set(excluded);
  const draftDays = [...selected].sort().map(date => ({
    date,
    times: availabilityTimes([date], start, end, now).filter(time => !omitted.has(time)),
  }));
  const savedDays = new Map<string, SavedViewingTime[]>();
  for (const slot of savedTimes ?? []) {
    const date = dayKey(Date.parse(slot.starts_at));
    const times = savedDays.get(date) ?? [];
    times.push(slot);
    savedDays.set(date, times);
  }

  function discardDay(date: string) {
    setSelected(days => days.filter(day => day !== date));
    setExcluded(times => times.filter(time => dayKey(Date.parse(time)) !== date));
  }

  return <form action={submit} aria-busy={pending} className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-5">
    <h3 className="font-semibold">{pilot("viewingTime")}</h3>
    <fieldset disabled={pending} className="grid min-w-0 gap-4">
      <div className="flex items-center justify-between">
        <button type="button" className={arrows} disabled={!week} aria-label={common("previous")} onClick={() => setWeek(week - 1)}><ChevronLeft className="size-4" /></button>
        <p className="text-sm font-semibold">{month.formatRange(dalatDate(dates[0]), dalatDate(dates[6]))}</p>
        <button type="button" className={arrows} disabled={week >= 24} aria-label={common("next")} onClick={() => setWeek(week + 1)}><ChevronRight className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2" role="group" aria-label={t("availableDates")}>
        {dates.map(date => <button type="button" key={date} aria-pressed={selected.includes(date)}
          aria-label={dateLabel(date)}
          disabled={!selected.includes(date) && selected.length >= 31}
          className="min-h-12 min-w-0 rounded-xl border bg-background px-0.5 text-xs aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          onClick={() => selected.includes(date) ? discardDay(date) : setSelected(days => [...days, date])}>
          {formatter.format(dalatDate(date))}
        </button>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">{t("startTime")}
          <select className={control} name="start" value={start} onChange={event => {
            const value = Number(event.target.value);
            setStart(value);
            if (value >= end) setEnd(value + 1);
          }}>
            {Array.from({ length: 31 }, (_, i) => <option value={16 + i} key={i}>{displayTime(16 + i)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">{t("endTime")}
          <select className={control} name="end" value={end} onChange={event => setEnd(Number(event.target.value))}>
            {Array.from({ length: 47 - start }, (_, i) => <option value={start + i + 1} key={i}>{displayTime(start + i + 1)}</option>)}
          </select>
        </label>
      </div>
      {excluded.map(time => <input key={time} type="hidden" name="exclude" value={time} />)}
      {draftDays.map(({ date, times }) => <div key={date} className="rounded-xl border px-3 pb-3 text-sm">
        <input type="hidden" name="day" value={date} />
        <div className="flex items-center justify-between">
          <p className="font-medium">{dateLabel(date)}</p>
          <button type="button" className={removeDay} aria-label={removeLabel(dateLabel(date))} onClick={() => discardDay(date)}>
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {times.map(time => {
            const label = clock.format(Date.parse(time));
            return <button type="button" key={time} className={removeTime} aria-label={removeLabel(`${dateLabel(date)}, ${label}`)}
              onClick={() => setExcluded(values => [...values, time])}>
              {label}<X className="size-3.5" aria-hidden />
            </button>;
          })}
        </div>
      </div>)}
      <button type="submit" disabled={!draftDays.some(day => day.times.length)}
        className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-45">
        {pilot("addTime")}
      </button>
    </fieldset>
    {feedback === "saved" && <p role="status" className="text-sm font-medium text-primary">{t("availabilitySaved")}</p>}
    {feedback === "removed" && <p role="status" className="text-sm font-medium text-primary">{t("availabilityRemoved")}</p>}
    {feedback === "future" && <p role="alert" className="text-sm text-destructive">{t("availabilityFuture")}</p>}
    {(feedback === "failed" || savedTimes === null) && <p role="alert" className="text-sm text-destructive">{pilot("failed")}</p>}
    {savedDays.size > 0 && <details className="rounded-xl border p-3" open={showSaved} onToggle={event => setShowSaved(event.currentTarget.open)}>
      <summary className="cursor-pointer font-medium">{t("savedViewingTimes")}</summary>
      <fieldset disabled={pending} className="mt-2 min-w-0 space-y-2 text-sm">
        {[...savedDays].map(([date, times]) => <div key={date}>
          <div className="flex items-center justify-between">
            <p className="font-medium">{dateLabel(date)}</p>
            {times.some(slot => !slot.visit_status) && <button type="submit" className={removeDay}
              name="removeDay" value={date} aria-label={t("removeOpenDay", { date: dateLabel(date) })}>
              <X className="size-4" aria-hidden />
            </button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {times.map(slot => {
              const label = clock.format(Date.parse(slot.starts_at));
              if (slot.visit_status) return <span key={slot.id} className="inline-flex min-h-11 items-center px-3 text-muted-foreground tabular-nums">
                {label} · {pilot(slot.visit_status)}
              </span>;
              return <button type="submit" key={slot.id} className={removeTime} name="removeSlot" value={slot.id}
                aria-label={removeLabel(`${dateLabel(date)}, ${label}`)}>
                {label}<X className="size-3.5" aria-hidden />
              </button>;
            })}
          </div>
        </div>)}
      </fieldset>
    </details>}
  </form>;
}
