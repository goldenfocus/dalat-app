"use client";

import { useId, type ReactNode } from "react";

/** Shared staff navigation: one panel, with normal keyboard-accessible tabs. */
export function HostTabs<T extends string>({ value, onChange, items, label, children }: {
  value: T; onChange: (value: T) => void; items: { value: T; label: string }[]; label: string; children: ReactNode;
}) {
  const id = useId();
  return <>
    <div role="tablist" aria-label={label} className="mb-5 flex overflow-x-auto border-b border-border/60">
      {items.map((item, index) => <button key={item.value} type="button" role="tab" id={`${id}-${item.value}`} aria-selected={value === item.value} aria-controls={`${id}-panel`} tabIndex={value === item.value ? 0 : -1}
        className={`min-h-12 flex-1 whitespace-nowrap border-b-2 px-4 text-sm font-semibold ${value === item.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
        onClick={() => onChange(item.value)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % items.length : event.key === "ArrowLeft" ? (index - 1 + items.length) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); onChange(items[next].value);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}>{item.label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`}>{children}</div>
  </>;
}
