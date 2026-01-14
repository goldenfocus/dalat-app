"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertCircle, ArrowLeft, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { detectBrowserLocale } from "@/lib/locale";
import { PasswordPromptDialog } from "./password-prompt-dialog";
import type { Locale } from "@/lib/types";

interface ProfileStepProps {
  userId: string;
  defaultDisplayName?: string;
  avatarUrl: string | null;
  onBack: () => void;
  redirectTo?: string;
}

export function ProfileStep({
  userId,
  defaultDisplayName,
  avatarUrl,
  onBack,
  redirectTo = "/",
}: ProfileStepProps) {
  const router = useRouter();
  const t = useTranslations("onboarding");
  const tProfile = useTranslations("profile");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  // Form state
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(defaultDisplayName || "");

  // Validation state
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // Locale detection - detectBrowserLocale returns one of The Global Twelve
  const [detectedLocale, setDetectedLocale] = useState<Locale>("en");

  useEffect(() => {
    setDetectedLocale(detectBrowserLocale());
  }, []);

  // Debounced username availability check
  useEffect(() => {
    if (!username) {
      setUsernameAvailable(null);
      setUsernameError(null);
      return;
    }

    // Client-side validation first
    if (username.length < 3) {
      setUsernameError(tProfile("usernameMinLength"));
      setUsernameAvailable(null);
      return;
    }
    if (username.length > 20) {
      setUsernameError(tProfile("usernameMaxLength"));
      setUsernameAvailable(null);
      return;
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      setUsernameError(tProfile("usernameFormat"));
      setUsernameAvailable(null);
      return;
    }

    setUsernameError(null);
    setUsernameChecking(true);

    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", userId)
        .maybeSingle();

      setUsernameChecking(false);
      setUsernameAvailable(!existing);
      if (existing) {
        setUsernameError(tProfile("usernameTaken"));
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, userId, tProfile]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(value);
  };

  const canSubmit =
    username.length >= 3 &&
    !usernameChecking &&
    !usernameError &&
    usernameAvailable !== false;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    startTransition(async () => {
      const supabase = createClient();

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          username,
          display_name: displayName.trim() || null,
          avatar_url: avatarUrl,
          locale: detectedLocale,
        })
        .eq("id", userId);

      if (updateError) {
        if (updateError.message.includes("valid_username")) {
          setError(t("profileStep.invalidUsername"));
        } else if (updateError.message.includes("unique")) {
          setError(tProfile("usernameTaken"));
        } else {
          setError(updateError.message);
        }
        return;
      }

      // Show password prompt dialog before redirecting
      setShowPasswordPrompt(true);
    });
  }

  function handlePasswordPromptComplete() {
    setShowPasswordPrompt(false);
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Avatar preview with back button */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all active:scale-95"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-16 h-16 rounded-full overflow-hidden bg-muted border-2 border-background shadow">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={t("profileStep.yourAvatar")}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
        </div>
        <div>
          <p className="font-medium">{t("profileStep.almostThere")}</p>
          <p className="text-sm text-muted-foreground">{t("profileStep.setNameUsername")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Username */}
        <div className="space-y-2">
          <Label htmlFor="username">{tProfile("username")} *</Label>
          <div className="relative">
            <div className="flex items-center">
              <span className="text-muted-foreground mr-1">@</span>
              <Input
                id="username"
                name="username"
                value={username}
                onChange={handleUsernameChange}
                placeholder={tProfile("usernamePlaceholder")}
                className={cn(
                  "pr-10",
                  usernameError && "border-destructive focus-visible:ring-destructive"
                )}
                autoFocus
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameChecking && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                )}
                {!usernameChecking && usernameAvailable === true && (
                  <Check className="w-4 h-4 text-green-500" />
                )}
                {!usernameChecking && usernameError && (
                  <AlertCircle className="w-4 h-4 text-destructive" />
                )}
              </div>
            </div>
          </div>
          {usernameError && (
            <p className="text-sm text-destructive">{usernameError}</p>
          )}
          {!usernameError && usernameAvailable === true && (
            <p className="text-sm text-green-600">{tProfile("usernameAvailable")}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {tProfile("usernameHelp")}
          </p>
        </div>

        {/* Display Name */}
        <div className="space-y-2">
          <Label htmlFor="display_name">{tProfile("displayName")}</Label>
          <Input
            id="display_name"
            name="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={tProfile("displayNamePlaceholder")}
            maxLength={50}
          />
          <p className="text-xs text-muted-foreground">
            {tProfile("displayNameHelp")}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          disabled={isPending || !canSubmit}
          className="w-full"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("profileStep.saving")}
            </>
          ) : (
            t("profileStep.complete")
          )}
        </Button>
      </form>

      {/* Password setup prompt */}
      <PasswordPromptDialog
        open={showPasswordPrompt}
        onComplete={handlePasswordPromptComplete}
      />
    </div>
  );
}
