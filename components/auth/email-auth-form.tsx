"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, Eye, EyeOff, Send, Check } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import confetti from "canvas-confetti";

interface EmailAuthFormProps {
  onSuccessChange?: (isSuccess: boolean) => void;
}

export function EmailAuthForm({ onSuccessChange }: EmailAuthFormProps) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [confettiFired, setConfettiFired] = useState(false);

  // Fire confetti when success and notify parent
  useEffect(() => {
    if (successEmail && !confettiFired) {
      fireConfetti();
      setConfettiFired(true);
      onSuccessChange?.(true);
    }
  }, [successEmail, confettiFired, onSuccessChange]);

  const fireConfetti = () => {
    // Gentle burst from center-top
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.3 },
      colors: ["#22c55e", "#4ade80", "#86efac", "#fbbf24", "#f472b6"],
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
        const { data: signUpData, error: signUpError } =
          await supabase.auth.signUp({
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
        } else if (
          signUpData.user?.identities &&
          signUpData.user.identities.length === 0
        ) {
          // Supabase returns empty identities for existing confirmed accounts
          // This means user exists but entered wrong password
          setError(t("invalidCredentials"));
        } else {
          // New account created - show celebration!
          setSuccessEmail(email);
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

  async function handleResend() {
    if (!successEmail || isResending) return;

    setIsResending(true);
    setResent(false);

    try {
      const supabase = createClient();
      await supabase.auth.resend({
        type: "signup",
        email: successEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      setResent(true);
      // Reset resent status after 3 seconds
      setTimeout(() => setResent(false), 3000);
    } catch {
      // Silently fail - the email might already be on its way
    } finally {
      setIsResending(false);
    }
  }

  // Celebration success state
  if (successEmail) {
    return (
      <div className="flex flex-col items-center text-center space-y-6 py-4">
        {/* Animated envelope icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center animate-bounce-gentle">
            <Mail className="w-10 h-10 text-white" />
          </div>
          {/* Sparkle effects */}
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full animate-ping opacity-75" />
          <div className="absolute -bottom-1 -left-2 w-3 h-3 bg-pink-400 rounded-full animate-ping opacity-75 animation-delay-200" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">{t("successTitle")}</h2>
          <p className="text-muted-foreground">{t("successSubtitle")}</p>
          <p className="font-medium text-lg">{successEmail}</p>
        </div>

        {/* Hint */}
        <p className="text-sm text-muted-foreground max-w-[280px]">
          {t("successHint")}
        </p>

        {/* Check spam hint with a touch of humor */}
        <p className="text-xs text-muted-foreground/70 italic">
          {t("checkSpamHint")}
        </p>

        {/* Resend button */}
        <button
          onClick={handleResend}
          disabled={isResending}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 py-2 px-4 rounded-lg hover:bg-muted/50 active:scale-95"
        >
          {isResending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("resending")}
            </>
          ) : resent ? (
            <>
              <Check className="w-4 h-4 text-green-500" />
              {t("emailResent")}
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              {t("resendEmail")}
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          autoComplete="email"
          className="h-12"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
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

      <Button type="submit" className="w-full h-12" disabled={isLoading}>
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
    </form>
  );
}
