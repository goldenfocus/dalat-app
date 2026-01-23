"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageStep } from "./language-step";
import { AvatarStep } from "./avatar-step";
import { ProfileStep } from "./profile-step";
import type { Locale } from "@/lib/types";

type Step = "language" | "avatar" | "profile";

interface OnboardingFlowProps {
  userId: string;
  defaultDisplayName?: string;
  oauthAvatarUrl?: string | null;
  redirectTo?: string;
  authProvider?: string; // "email" | "google" - determines if user already has password
}

export function OnboardingFlow({
  userId,
  defaultDisplayName,
  oauthAvatarUrl,
  redirectTo = "/",
  authProvider = "email",
}: OnboardingFlowProps) {
  const t = useTranslations("onboarding");
  const tSettings = useTranslations("settings");
  const currentLocale = useLocale() as Locale;
  const [currentStep, setCurrentStep] = useState<Step>("language");
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);

  const handleLanguageComplete = () => {
    setCurrentStep("avatar");
  };

  const handleAvatarComplete = (avatarUrl: string | null) => {
    setSelectedAvatarUrl(avatarUrl);
    setCurrentStep("profile");
  };

  const handleAvatarSkip = () => {
    setSelectedAvatarUrl(null);
    setCurrentStep("profile");
  };

  const handleBackToAvatar = () => {
    setCurrentStep("avatar");
  };

  const handleBackToLanguage = () => {
    setCurrentStep("language");
  };

  // Get step subtitle
  const getStepSubtitle = () => {
    switch (currentStep) {
      case "language":
        return tSettings("language");
      case "avatar":
        return t("avatarStep.subtitle");
      case "profile":
        return t("profileStep.subtitle");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">{t("welcome")}</h1>
        <p className="text-muted-foreground">{getStepSubtitle()}</p>
      </div>

      {/* Step indicator - 3 steps now */}
      <div className="flex justify-center gap-2">
        <div
          className={`w-2 h-2 rounded-full transition-colors ${
            currentStep === "language" ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        />
        <div
          className={`w-2 h-2 rounded-full transition-colors ${
            currentStep === "avatar" ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        />
        <div
          className={`w-2 h-2 rounded-full transition-colors ${
            currentStep === "profile" ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        />
      </div>

      {/* Content */}
      <Card>
        <CardContent className="p-6">
          {currentStep === "language" ? (
            <LanguageStep
              currentLocale={currentLocale}
              onComplete={handleLanguageComplete}
            />
          ) : currentStep === "avatar" ? (
            <AvatarStep
              userId={userId}
              displayName={defaultDisplayName}
              oauthAvatarUrl={oauthAvatarUrl}
              onComplete={handleAvatarComplete}
              onSkip={handleAvatarSkip}
            />
          ) : (
            <ProfileStep
              userId={userId}
              defaultDisplayName={defaultDisplayName}
              avatarUrl={selectedAvatarUrl}
              onBack={handleBackToAvatar}
              redirectTo={redirectTo}
              hasEmailAuth={authProvider === "email"}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
