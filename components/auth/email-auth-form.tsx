"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, Eye, EyeOff } from "lucide-react";
import { Link } from "@/lib/i18n/routing";

type AuthMode = "login" | "signup";

export function EmailAuthForm() {
  const t = useTranslations("auth");
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError(t("emailPasswordRequired"));
      return;
    }

    if (isSignup && password !== confirmPassword) {
      setError(t("passwordsDoNotMatch"));
      return;
    }

    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            setError(t("emailAlreadyRegistered"));
          } else {
            setError(error.message);
          }
        } else {
          setSuccess(t("checkEmailForConfirmation"));
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            setError(t("invalidCredentials"));
          } else {
            setError(error.message);
          }
        } else {
          // Redirect handled by Supabase auth state change
          window.location.href = "/";
        }
      }
    } catch {
      setError(t("somethingWentWrong"));
    } finally {
      setIsLoading(false);
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
        <Alert>
          <Mail className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
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
            autoComplete={isSignup ? "new-password" : "current-password"}
            className="h-12 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

      {isSignup && (
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            placeholder={t("confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
            className="h-12"
          />
        </div>
      )}

      {!isSignup && (
        <div className="text-right">
          <Link
            href="/auth/forgot-password"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("forgotPassword")}
          </Link>
        </div>
      )}

      <Button type="submit" className="w-full h-12" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("loading")}
          </>
        ) : isSignup ? (
          t("createAccount")
        ) : (
          t("signIn")
        )}
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        {isSignup ? (
          <>
            {t("alreadyHaveAccount")}{" "}
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setSuccess(null);
              }}
              className="text-primary hover:underline"
            >
              {t("signIn")}
            </button>
          </>
        ) : (
          <>
            {t("dontHaveAccount")}{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
                setSuccess(null);
              }}
              className="text-primary hover:underline"
            >
              {t("createAccount")}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
