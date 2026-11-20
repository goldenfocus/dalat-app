"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addRentalAvailability } from "@/app/[locale]/rentals/actions";
import { dalatDate, dalatZone, halfHour, weekDays } from "@/lib/rentals/calendar";

export function AvailabilityEditor({ today, locale }: { today: string; locale: string }) {
  const [week, setWeek] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [start, setStart] = useState(18);
  const [end, setEnd] = useState(34);
  const t = useTranslations("rentalsDetails");
  const common = useTranslations("common");
  const pilot = useTranslations("rentalsPilot");
  const dates = weekDays(today, week);
  const formatter = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, weekday: "short", day: "numeric" });
  const longer = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, weekday: "long", day: "numeric", month: "long" });
  const month = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, month: "long", year: "numeric" });
  const clock = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, hour: "numeric", minute: "2-digit" });
  const displayTime = (index: number) => clock.format(dalatDate(today).getTime() + index * halfHour);
  const arrows = "grid size-11 place-items-center rounded-full border bg-background disabled:opacity-40";
  const control = "min-h-11 w-full rounded-xl border bg-background px-3 text-sm";
  return <form action={addRentalAvailability} className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-5">
    <h3 className="font-semibold">{pilot("viewingTime")}</h3>
    <div className="flex items-center justify-between">
      <button type="button" className={arrows} disabled={!week} aria-label={common("previous")} onClick={() => setWeek(week - 1)}><ChevronLeft className="size-4" /></button>
      <p className="text-sm font-semibold">{month.formatRange(dalatDate(dates[0]), dalatDate(dates[6]))}</p>
      <button type="button" className={arrows} disabled={week >= 24} aria-label={common("next")} onClick={() => setWeek(week + 1)}><ChevronRight className="size-4" /></button>
    </div>
    <div className="grid grid-cols-7 gap-1 sm:gap-2" role="group" aria-label={t("availableDates")}>
      {dates.map(date => <button type="button" key={date} aria-pressed={selected.includes(date)}
        aria-label={longer.format(dalatDate(date))}
        disabled={!selected.includes(date) && selected.length >= 31}
        className="min-h-12 min-w-0 rounded-xl border bg-background px-0.5 text-xs aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        onClick={() => setSelected(selected.includes(date) ? selected.filter(value => value !== date) : [...selected, date])}>
        {formatter.format(dalatDate(date))}
      </button>)}
    </div>
    {selected.length > 0 && <p className="text-sm text-muted-foreground">{t("selectedDates", { count: selected.length })}</p>}
    {selected.map(date => <input key={date} type="hidden" name="day" value={date} />)}
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
    <button disabled={selected.length === 0} className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-45">{pilot("addTime")}</button>
  </form>;
}
