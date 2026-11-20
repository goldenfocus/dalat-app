"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { requestViewing } from "@/app/[locale]/rentals/actions";
import { dalatDate, dalatZone, dayKey, viewingCalendar } from "@/lib/rentals/calendar";

type Choice = { id: string; starts_at: string };
type Props = { listing: string; slots: Choice[]; locale: string; title: string; action: string; formAction?: (form: FormData) => Promise<void> };

export function ViewingPicker({ listing, slots, locale, title, action, formAction = requestViewing }: Props) {
  const common = useTranslations("common");
  const t = useTranslations("rentalsDetails");
  const dayFormat = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, weekday: "long", month: "long", day: "numeric" });
  const monthFormat = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, month: "long", year: "numeric" });
  const weekdayFormat = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, weekday: "short" });
  const clock = new Intl.DateTimeFormat(locale, { timeZone: dalatZone, hour: "numeric", minute: "2-digit" });
  const number = new Intl.NumberFormat(locale);
  const days = new Map<string, Choice[]>();
  for (const slot of slots) {
    const key = dayKey(Date.parse(slot.starts_at));
    const group = days.get(key) ?? [];
    group.push(slot);
    days.set(key, group);
  }
  const months = [...new Set([...days.keys()].map(day => day.slice(0, 7)))];
  const [month, setMonth] = useState(0);
  const [day, setDay] = useState(days.keys().next().value ?? "");
  const [slot, setSlot] = useState("");
  const choices = days.get(day) ?? [];
  const monthKey = months[month] ?? months[0];
  const calendar = monthKey ? viewingCalendar(monthKey) : null;
  const radio = "min-h-10 rounded-xl border bg-background px-1.5 text-sm hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground";
  const arrow = "grid size-11 place-items-center rounded-full border bg-background disabled:opacity-35";
  const move = (by: number) => { setMonth(month + by); setDay(""); setSlot(""); };
  return (
    <form action={formAction} className="grid gap-4 rounded-2xl border bg-card p-3 sm:p-5">
      <input type="hidden" name="listing" value={listing} />
      <input type="hidden" name="slot" value={slot} />
      <h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="size-5 text-primary" aria-hidden="true" />{title}</h3>
      {calendar ? <>
        <div className="flex items-center justify-between gap-2">
          <button aria-label={common("previous")} type="button" disabled={month === 0} className={arrow} onClick={() => move(-1)}><ChevronLeft className="size-4 rtl:rotate-180" /></button>
          <strong className="text-center text-sm">{monthFormat.format(dalatDate(monthKey + "-01"))}</strong>
          <button aria-label={common("next")} type="button" disabled={month >= months.length - 1} className={arrow} onClick={() => move(1)}><ChevronRight className="size-4 rtl:rotate-180" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center sm:gap-1.5" role="group" aria-label={t("availableDates")}>
          {Array.from({ length: 7 }, (_, index) => <span className="py-1 text-xs text-muted-foreground" key={index}>
            {weekdayFormat.format(new Date(Date.UTC(2026, 0, 5 + index)))}
          </span>)}
          {Array.from({ length: calendar.padding }, (_, index) => <span key={index} />)}
          {calendar.days.map(key => days.has(key) ?
            <button key={key} type="button" className={radio} aria-label={dayFormat.format(dalatDate(key))}
              aria-pressed={day === key} onClick={() => { setDay(key); setSlot(""); }}>
              {number.format(Number(key.slice(-2)))}
            </button> : <span key={key} className="grid min-h-10 place-items-center text-sm text-muted-foreground/75">{number.format(Number(key.slice(-2)))}</span>)}
        </div>
        {choices.length > 0 && <div className="space-y-2">
          <p className="text-sm font-semibold">{dayFormat.format(dalatDate(day))}</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={title}>
            {choices.map(choice => (
              <button key={choice.id} type="button" aria-pressed={slot === choice.id} className={radio}
                onClick={() => setSlot(choice.id)}>{clock.format(new Date(choice.starts_at))}</button>
            ))}
          </div>
        </div>}
      </> : <p className="text-sm text-muted-foreground">{t("onRequest")}</p>}
      <button type="submit" disabled={days.size > 0 && !choices.some(choice => choice.id === slot)}
        className="min-h-12 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-45">
        {action}
      </button>
    </form>
  );
}
