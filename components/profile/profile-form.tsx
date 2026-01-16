"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { detectBrowserLocale, SUPPORTED_LOCALES } from "@/lib/locale";
import type { Locale, ContentLocale } from "@/lib/types";

interface ProfileFormProps {
  userId: string;
  defaultDisplayName?: string;
  redirectTo?: string;
}

export function ProfileForm({
  userId,
  defaultDisplayName,
  redirectTo = "/",
}: ProfileFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  // Detect browser locale and map to supported UI locale
  const [detectedLocale, setDetectedLocale] = useState<Locale>('en');

  useEffect(() => {
    const browserLocale = detectBrowserLocale();
    // Map content locale to UI locale (only en, fr, vi are UI locales)
    const uiLocale = SUPPORTED_LOCALES.includes(browserLocale as Locale)
      ? (browserLocale as Locale)
      : 'en';
    setDetectedLocale(uiLocale);
  }, []);

  function validateUsername(value: string): boolean {
    if (value.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      return false;
    }
    if (value.length > 20) {
      setUsernameError("Username must be 20 characters or less");
      return false;
    }
    if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(value) && !/^[a-z0-9]{3}$/.test(value)) {
      setUsernameError("Letters, numbers, dots, dashes, underscores. Must start/end with letter or number.");
      return false;
    }
    if (/[._-]{2,}/.test(value)) {
      setUsernameError("Cannot have consecutive dots, dashes, or underscores");
      return false;
    }
    setUsernameError(null);
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const username = (formData.get("username") as string).toLowerCase().trim();
    const displayName = (formData.get("display_name") as string).trim();

    if (!validateUsername(username)) {
      return;
    }

    const supabase = createClient();

    startTransition(async () => {
      // Check if username is taken
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", userId)
        .maybeSingle();

      if (existing) {
        setError("Username is already taken");
        return;
      }

      // Update profile with detected locale
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          username,
          display_name: displayName || null,
          locale: detectedLocale,
        })
        .eq("id", userId);

      if (updateError) {
        if (updateError.message.includes("valid_username")) {
          setError("Invalid username format");
        } else {
          setError(updateError.message);
        }
        return;
      }

      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="username">Username *</Label>
            <div className="flex items-center">
              <span className="text-muted-foreground mr-1">@</span>
              <Input
                id="username"
                name="username"
                placeholder="yourname"
                required
                pattern="[a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9]{3}"
                onChange={(e) => {
                  const value = e.target.value.toLowerCase();
                  e.target.value = value;
                  if (value) validateUsername(value);
                }}
              />
            </div>
            {usernameError && (
              <p className="text-sm text-red-500">{usernameError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              3-20 characters. Letters, numbers, dots, dashes, underscores.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              name="display_name"
              placeholder="Your Name"
              defaultValue={defaultDisplayName}
            />
            <p className="text-xs text-muted-foreground">
              How your name appears on events
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Saving..." : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
