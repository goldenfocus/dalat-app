"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Person } from "@/lib/practice/model";

/** Decorative shorthand for the languages someone can help with; the code stays the tooltip. */
const LANGUAGE_FLAGS: Record<string, string> = {
  vi: "🇻🇳", en: "🇬🇧", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", ja: "🇯🇵", ko: "🇰🇷", zh: "🇨🇳", ru: "🇷🇺", it: "🇮🇹", pt: "🇵🇹",
};

export function PracticePerson({ person, number = false }: { person: Person; number?: boolean }) {
  const initials = person.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("");
  return <span className="flex min-w-0 items-center gap-2.5">
    <Avatar className="h-10 w-10 border border-border/60">
      <AvatarImage src={person.avatarUrl || undefined} alt="" />
      <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">{initials}</AvatarFallback>
    </Avatar>
    <span className="min-w-0 break-words font-semibold leading-snug">{person.name}{number && person.number ? <span className="ml-1 text-xs font-normal text-muted-foreground">#{person.number}</span> : null}{person.speaks.length > 0 && <span aria-hidden="true" className="ml-1.5 inline-flex flex-wrap gap-1 align-middle text-sm font-normal">{person.speaks.slice(0, 4).map(code => <span key={code} title={code} className={LANGUAGE_FLAGS[code] ? undefined : "rounded border border-border/60 px-1 text-[0.65rem] font-medium uppercase leading-4 text-muted-foreground"}>{LANGUAGE_FLAGS[code] || code}</span>)}</span>}</span>
  </span>;
}
