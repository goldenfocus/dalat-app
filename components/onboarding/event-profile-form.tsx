"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isEventUsername, publicEventName } from "@/lib/auth/event-profile";
import { createClient } from "@/lib/supabase/client";

interface EventProfileFormProps {
  userId: string;
  displayName: string;
  username: string;
  destination: string;
}

export function EventProfileForm({
  userId,
  displayName: initialName,
  username: initialUsername,
  destination,
}: EventProfileFormProps) {
  const t = useTranslations("profile");
  const onboarding = useTranslations("onboarding.profileStep");
  const auth = useTranslations("auth");
  const organizer = useTranslations("organizer");
  const [displayName, setDisplayName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const name = publicEventName(displayName);
    const handle = username.trim().toLowerCase() || initialUsername;
    if (!name) {
      setError(organizer("nameRequired"));
      return;
    }
    if (!isEventUsername(handle)) {
      setError(t("usernameFormat"));
      return;
    }

    setError("");
    setSaving(true);
    try {
      const { error: saveError } = await createClient().from("profiles")
        .update({ display_name: name, username: handle })
        .eq("id", userId)
        .select("id")
        .single();

      if (saveError) {
        setError(saveError.code === "23505" ? t("usernameTaken") : auth("somethingWentWrong"));
      } else {
        window.location.replace(destination);
        return;
      }
    } catch {
      setError(auth("somethingWentWrong"));
    }
    setSaving(false);
  }

  return (
    <form className="space-y-4" onSubmit={save}>
      <h1 className="text-xl font-semibold">{onboarding("setNameUsername")}</h1>
      <div className="space-y-2">
        <Label htmlFor="event-display-name">{t("displayName")}</Label>
        <Input id="event-display-name" className="min-h-11 text-base" autoComplete="nickname"
          required maxLength={80} value={displayName} onChange={event => setDisplayName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="event-username">{t("username")}</Label>
        <Input id="event-username" className="min-h-11 text-base" autoComplete="username"
          autoCapitalize="none" spellCheck={false} maxLength={20} placeholder={initialUsername}
          value={username} onChange={event => setUsername(event.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving} className="min-h-11 w-full">
        {saving ? t("saving") : t("continue")}
      </Button>
    </form>
  );
}
