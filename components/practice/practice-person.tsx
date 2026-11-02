"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Person } from "@/lib/practice/model";

export function PracticePerson({ person, number = false }: { person: Person; number?: boolean }) {
  const initials = person.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("");
  return <span className="flex min-w-0 items-center gap-2.5">
    <Avatar className="h-10 w-10 border border-border/60">
      <AvatarImage src={person.avatarUrl || undefined} alt="" />
      <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">{initials}</AvatarFallback>
    </Avatar>
    <span className="min-w-0 break-words font-semibold leading-snug">{person.name}{number && person.number ? <span className="ml-1 text-xs font-normal text-muted-foreground">#{person.number}</span> : null}</span>
  </span>;
}
