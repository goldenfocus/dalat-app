"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Eye, EyeOff, Check, KeyRound } from "lucide-react";

interface PasswordSettingsProps {
  userEmail: string;
}

export function PasswordSettings({ userEmail }: PasswordSettingsProps) {
  const t = useTranslations("settings.password");
  const tAuth = useTranslations("auth");
  const [showForm, setShowForm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(tAuth("passwordTooShort"));
      return;
    }

    if (password !== confirmPassword) {
      setError(tAuth("passwordsDoNotMatch"));
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");

      // Hide form after a moment
      setTimeout(() => {
        setShowForm(false);
        setSuccess(false);
      }, 2000);
    } catch {
      setError(tAuth("somethingWentWrong"));
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
        </div>
        <span className="text-sm text-green-600 dark:text-green-400">
          {t("passwordUpdated")}
        </span>
      </div>
    );
  }

  if (!showForm) {
    return (
      <Button
        variant="outline"
        onClick={() => setShowForm(true)}
        className="w-full justify-start"
      >
        <KeyRound className="w-4 h-4 mr-2" />
        {t("setOrChangePassword")}
      </Button>
    );
  }

  return (
    <form onSubmit={handleSetPassword} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="settings-password">{tAuth("newPassword")}</Label>
        <div className="relative">
          <Input
            id="settings-password"
            type={showPassword ? "text" : "password"}
            placeholder={tAuth("newPasswordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
            className="h-12 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-confirm-password">{tAuth("confirmPassword")}</Label>
        <Input
          id="settings-confirm-password"
          type={showPassword ? "text" : "password"}
          placeholder={tAuth("confirmPasswordPlaceholder")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={isLoading}
          autoComplete="new-password"
          className="h-12"
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setShowForm(false);
            setPassword("");
            setConfirmPassword("");
            setError(null);
          }}
          disabled={isLoading}
          className="flex-1"
        >
          {tAuth("cancel") || "Cancel"}
        </Button>
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {tAuth("loading")}
            </>
          ) : (
            t("savePassword")
          )}
        </Button>
      </div>
    </form>
  );
}
