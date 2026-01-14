"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, Eye, EyeOff, ChevronDown } from "lucide-react";
import { Link } from "@/lib/i18n/routing";

export function EmailAuthForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAnyLoading = isLoading || isMagicLinkLoading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError(t("emailPasswordRequired"));
      return;
    }

    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      // Try to sign in first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!signInError) {
        // Success - redirect to home
        window.location.href = "/";
        return;
      }

      // If invalid credentials, try to create account
      if (signInError.message.includes("Invalid login credentials")) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { locale },
          },
        });

        if (signUpError) {
          // If already registered, it means wrong password
          if (signUpError.message.includes("already registered")) {
            setError(t("invalidCredentials"));
          } else {
            setError(signUpError.message);
          }
        } else {
          // New account created - check email
          setSuccess(t("accountCreatedCheckEmail"));
        }
      } else {
        // Other sign-in error
        setError(signInError.message);
      }
    } catch {
      setError(t("somethingWentWrong"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMagicLink() {
    setError(null);
    setSuccess(null);

    if (!email) {
      setError(t("emailRequired"));
      return;
    }

    setIsMagicLinkLoading(true);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { locale },
        },
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess(t("magicLinkSent"));
      }
    } catch {
      setError(t("somethingWentWrong"));
    } finally {
      setIsMagicLinkLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          <Mail className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Email input - always visible */}
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isAnyLoading}
          autoComplete="email"
          className="h-12"
        />
      </div>

      {/* Primary CTA: Magic Link */}
      <Button
        type="button"
        className="w-full h-12"
        onClick={handleMagicLink}
        disabled={isAnyLoading}
      >
        {isMagicLinkLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("loading")}
          </>
        ) : (
          <>
            <Mail className="mr-2 h-4 w-4" />
            {t("continueWithEmail")}
          </>
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("wellEmailYouLink")}
      </p>

      {/* Expandable password section */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowPasswordSection(!showPasswordSection)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>{t("orUsePassword")}</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showPasswordSection ? "rotate-180" : ""}`}
          />
        </button>

        {showPasswordSection && (
          <div className="space-y-4 pt-4 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isAnyLoading}
                  autoComplete="current-password"
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

            <div className="text-right">
              <Link
                href="/auth/forgot-password"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("forgotPassword")}
              </Link>
            </div>

            <Button
              type="submit"
              variant="outline"
              className="w-full h-12"
              disabled={isAnyLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("loading")}
                </>
              ) : (
                t("signInWithPassword")
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {t("signInOrCreateHint")}
            </p>
          </div>
        )}
      </div>
    </form>
  );
}
