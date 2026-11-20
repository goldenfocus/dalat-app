"use client";

import { useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { requestViewing } from "@/app/[locale]/rentals/actions";

type Choice = { id: string; starts_at: string };
type Props = {
  listing: string;
  slots: Choice[];
  locale: string;
  title: string;
  action: string;
};

export function ViewingPicker({ listing, slots, locale, title, action }: Props) {
  const zone = "Asia/Ho_Chi_Minh";
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const dayFormat = new Intl.DateTimeFormat(locale, {
    timeZone: zone, weekday: "short", day: "numeric", month: "short",
  });
  const clock = new Intl.DateTimeFormat(locale, { timeZone: zone, hour: "numeric", minute: "2-digit" });
  const days = new Map<string, Choice[]>();
  for (const slot of slots) {
    const key = dayKey.format(new Date(slot.starts_at));
    const group = days.get(key) ?? [];
    group.push(slot);
    days.set(key, group);
  }
  const [day, setDay] = useState(days.keys().next().value);
  const [slot, setSlot] = useState("");
  const choices = days.get(day ?? "") ?? [];
  const radio = "min-h-11 rounded-lg border px-3 py-2 text-sm hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:font-semibold";
  return (
    <form action={requestViewing} className="grid gap-3 rounded-2xl border p-4">
      <input type="hidden" name="listing" value={listing} />
      <input type="hidden" name="slot" value={slot} />
      <h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="size-4" aria-hidden="true" />{title}</h3>
      {days.size > 0 && <>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {[...days].map(([key, group]) => (
            <button key={key} type="button" aria-pressed={day === key} className={radio + " shrink-0"}
              onClick={() => { setDay(key); setSlot(""); }}>
              {dayFormat.format(new Date(group[0].starts_at))}
            </button>
          ))}
        </div>
        {choices.length > 0 && <div className="flex flex-wrap gap-2">
          {choices.map(choice => (
            <button key={choice.id} type="button" aria-pressed={slot === choice.id}
              className={radio + " inline-flex items-center gap-1.5"} onClick={() => setSlot(choice.id)}>
              <Clock3 className="size-4" aria-hidden="true" />{clock.format(new Date(choice.starts_at))}
            </button>
          ))}
        </div>}
      </>}
      <button type="submit" disabled={days.size > 0 && !choices.some(choice => choice.id === slot)}
        className="min-h-11 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50">
        {action}
      </button>
    </form>
  );
}
