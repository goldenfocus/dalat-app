"use client";

import { useRef, useState } from "react";
import { Link, useRouter } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";
import { PEOPLE_INTENTIONS, PEOPLE_INTERESTS, PEOPLE_LANGUAGES } from "@/lib/people/constants";
import type { PeopleProfile } from "@/lib/people/types";
import { LOCALE_NAMES, type ContentLocale } from "@/lib/types";
import { triggerTranslation } from "@/lib/translations-client";
import { PeopleChoices } from "./people-choices";
import { requestPeople } from "./request";

export interface PeopleEditorCopy {
  enabled: string;
  enabledDescription: string;
  privateHint: string;
  identityDescription: string;
  editIdentity: string;
  intentionsLabel: string;
  interestsLabel: string;
  languagesLabel: string;
  intentions: Record<string, string>;
  interests: Record<string, string>;
  helpOffered: string;
  helpOfferedPlaceholder: string;
  helpWanted: string;
  helpWantedPlaceholder: string;
  privacyNotice: string;
  save: string;
  saving: string;
  saved: string;
  saveError: string;
  translationPending: string;
  hideNow: string;
  hiding: string;
  hidden: string;
}

export function PeopleEditorForm({ initialProfile, isPrivate, locale, copy }: {
  initialProfile: PeopleProfile | null;
  isPrivate: boolean;
  locale: ContentLocale;
  copy: PeopleEditorCopy;
}) {
  const router = useRouter();
  const [savedProfile, setSavedProfile] = useState(initialProfile);
  const [enabled, setEnabled] = useState(!isPrivate && (initialProfile?.enabled ?? false));
  const [intentions, setIntentions] = useState(initialProfile?.intentions ?? []);
  const [interests, setInterests] = useState(initialProfile?.interests ?? []);
  const [languages, setLanguages] = useState(initialProfile?.languages ?? []);
  const [helpOffered, setHelpOffered] = useState(initialProfile?.help_offered ?? "");
  const [helpWanted, setHelpWanted] = useState(initialProfile?.help_wanted ?? "");
  const [busy, setBusy] = useState<"save" | "hide" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutationVersion = useRef(0);

  async function hide() {
    mutationVersion.current += 1;
    setBusy("hide");
    setError(null);
    setNotice(null);
    try {
      await requestPeople("/api/people/profile", "PATCH", { enabled: false });
      setEnabled(false);
      setSavedProfile((previous) => previous ? { ...previous, enabled: false } : null);
      setNotice(copy.hidden);
      router.refresh();
    } catch {
      setError(copy.saveError);
    } finally {
      setBusy(null);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const version = ++mutationVersion.current;
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const { profile } = await requestPeople<{ profile: PeopleProfile }>("/api/people/profile", "POST", {
        enabled: enabled && !isPrivate,
        intentions,
        interests,
        languages,
        help_offered: helpOffered.trim(),
        help_wanted: helpWanted.trim(),
        source_locale: locale,
      });
      const changedFields = [
        ...(profile.help_offered !== (savedProfile?.help_offered ?? "")
          ? [{ field_name: "help_offered" as const, text: profile.help_offered }] : []),
        ...(profile.help_wanted !== (savedProfile?.help_wanted ?? "")
          ? [{ field_name: "help_wanted" as const, text: profile.help_wanted }] : []),
      ];
      setSavedProfile(profile);
      setEnabled(profile.enabled);
      setHelpOffered(profile.help_offered);
      setHelpWanted(profile.help_wanted);
      setNotice(copy.saved);
      if (changedFields.length > 0) {
        void triggerTranslation("people", profile.user_id, changedFields).then((ok) => {
          if (!ok && mutationVersion.current === version) setNotice(copy.translationPending);
        });
      }
      router.refresh();
    } catch {
      setError(copy.saveError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={save} className="space-y-8">
      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium" htmlFor="people-enabled">
          <input
            id="people-enabled"
            type="checkbox"
            checked={enabled}
            disabled={isPrivate || !!busy}
            onChange={(event) => {
              if (!event.target.checked && savedProfile?.enabled) void hide();
              else setEnabled(event.target.checked);
            }}
            aria-describedby="people-enabled-help"
            className="h-5 w-5 shrink-0 accent-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          {copy.enabled}
        </label>
        <p id="people-enabled-help" className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy.enabledDescription}</p>
        {isPrivate && <p className="mt-3 text-sm text-muted-foreground">{copy.privateHint}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{copy.identityDescription}</p>
        <Link href="/settings/profile" className="-mx-3 flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted active:scale-95">{copy.editIdentity}</Link>
      </div>

      <PeopleChoices
        label={copy.intentionsLabel}
        options={PEOPLE_INTENTIONS.map((value) => ({ value, label: copy.intentions[value] }))}
        selected={intentions}
        onChange={setIntentions}
        disabled={!!busy}
      />

      <fieldset disabled={!!busy} className="space-y-6">
        <div className="space-y-2 [&_button]:min-h-11 [&_button]:min-w-11">
          <label htmlFor="people-help-offered" className="font-medium">{copy.helpOffered}</label>
          <AIEnhanceTextarea
            id="people-help-offered"
            name="help_offered"
            value={helpOffered}
            onChange={(value) => setHelpOffered(value.slice(0, 500))}
            maxLength={500}
            rows={4}
            placeholder={copy.helpOfferedPlaceholder}
            context="what I can help other people in my local community with"
            className="resize-y rounded-xl text-base leading-relaxed"
          />
          <p className="text-right text-xs tabular-nums text-muted-foreground">{helpOffered.length}/500</p>
        </div>
        <div className="space-y-2 [&_button]:min-h-11 [&_button]:min-w-11">
          <label htmlFor="people-help-wanted" className="font-medium">{copy.helpWanted}</label>
          <AIEnhanceTextarea
            id="people-help-wanted"
            name="help_wanted"
            value={helpWanted}
            onChange={(value) => setHelpWanted(value.slice(0, 500))}
            maxLength={500}
            rows={4}
            placeholder={copy.helpWantedPlaceholder}
            context="what I would love help with from people in my local community"
            className="resize-y rounded-xl text-base leading-relaxed"
          />
          <p className="text-right text-xs tabular-nums text-muted-foreground">{helpWanted.length}/500</p>
        </div>
      </fieldset>

      <PeopleChoices
        label={copy.interestsLabel}
        options={PEOPLE_INTERESTS.map((value) => ({ value, label: copy.interests[value] }))}
        selected={interests}
        onChange={setInterests}
        disabled={!!busy}
      />
      <PeopleChoices
        label={copy.languagesLabel}
        options={PEOPLE_LANGUAGES.map((value) => ({ value, label: LOCALE_NAMES[value] }))}
        selected={languages}
        onChange={setLanguages}
        disabled={!!busy}
      />
      <div className="space-y-4 border-t border-border pt-6">
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.privacyNotice}</p>
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!!busy} loading={busy === "save"} className="min-h-11 flex-1 sm:flex-none sm:px-8">{busy === "save" ? copy.saving : copy.save}</Button>
          {savedProfile?.enabled && (
            <Button type="button" variant="outline" disabled={!!busy} loading={busy === "hide"} onClick={() => void hide()} className="min-h-11">{busy === "hide" ? copy.hiding : copy.hideNow}</Button>
          )}
        </div>
      </div>
    </form>
  );
}
