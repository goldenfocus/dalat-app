"use client";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { languageDisplayName, languageFlag, LANGUAGE_CODES } from "@/lib/arrival/languages";
import type { Person } from "@/lib/practice/model";
export function PracticePerson({person,number=false}:{person:Person;number?:boolean}){
 const locale=useLocale(),t=useTranslations('eventPractice');
 const initials=person.name.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('');
 const languages=[...new Set([...person.speaks,...(person.learningLanguages||[person.learns])].filter((x):x is string=>!!x))];
 const status=person.presence==='present'?t('present'):person.presence==='absent'?t('absent'):t('waitingShort');
 return <span className={`flex min-w-0 items-center gap-2.5 ${person.presence==='present'?'':'opacity-65'}`}>
  <span className="relative shrink-0"><Avatar className={`h-9 w-9 border border-border/60 ${person.presence==='present'?'':'border-dashed'}`}><AvatarImage src={person.avatarUrl||undefined} alt=""/><AvatarFallback className="bg-accent text-xs text-accent-foreground">{initials}</AvatarFallback></Avatar><span aria-label={status} className="absolute -bottom-1 -right-1 rounded-full bg-background px-0.5 text-[10px]">{person.presence==='present'?'✓':person.presence==='absent'?'×':'○'}</span></span>
  <span className="min-w-0 flex-1 break-words text-sm">{person.name}{number&&person.number?<span className="ml-1 text-xs text-muted-foreground">#{person.number}</span>:null}</span>
  <span className="flex shrink-0 gap-0.5">{languages.slice(0,3).map(code=><span key={code} aria-label={LANGUAGE_CODES.includes(code as typeof LANGUAGE_CODES[number])?languageDisplayName(code as typeof LANGUAGE_CODES[number],locale):code} className="text-sm">{languageFlag(code)}</span>)}</span>
 </span>;
}
