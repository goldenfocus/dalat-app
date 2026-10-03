"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PeopleChoicesProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}

/** Labels come from the editor's translated dictionary (or native language names). */
export function PeopleChoices({
  label,
  options,
  selected,
  onChange,
  disabled,
}: PeopleChoicesProps) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-base font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={checked}
              onClick={() => onChange(checked
                ? selected.filter((value) => value !== option.value)
                : [...selected, option.value])}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
                checked
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {checked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
