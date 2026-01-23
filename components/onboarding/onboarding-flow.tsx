"use client";

import { useState, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageStep } from "./language-step";
import { AvatarStep } from "./avatar-step";
import { ProfileStep } from "./profile-step";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/types";

type Step = "language" | "avatar" | "profile";

const STEPS: Step[] = ["language", "avatar", "profile"];

interface OnboardingFlowProps {
  userId: string;
  defaultDisplayName?: string;
  oauthAvatarUrl?: string | null;
  redirectTo?: string;
  authProvider?: string;
}

// Progress indicator with connected line
function StepIndicator({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEPS.indexOf(currentStep);

  return (
    <div className="flex justify-center items-center gap-0">
      {STEPS.map((step, index) => {
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;

        return (
          <div key={step} className="flex items-center">
            {/* Dot */}
            <div
              className={cn(
                "w-2.5 h-2.5 rounded-full transition-all duration-300",
                isActive && "w-3 h-3 bg-primary scale-110",
                isCompleted && "bg-primary",
                !isActive && !isCompleted && "bg-muted-foreground/30"
              )}
            />
            {/* Connecting line (not after last dot) */}
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-8 h-0.5 transition-all duration-500",
                  isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
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
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("left");
  const contentRef = useRef<HTMLDivElement>(null);

  const handleLanguageComplete = () => {
    setSlideDirection("left");
    setCurrentStep("avatar");
  };

  const handleAvatarComplete = (avatarUrl: string | null) => {
    setSelectedAvatarUrl(avatarUrl);
    setSlideDirection("left");
    setCurrentStep("profile");
  };

  const handleAvatarSkip = () => {
    setSelectedAvatarUrl(null);
    setSlideDirection("left");
    setCurrentStep("profile");
  };

  const handleBackToAvatar = () => {
    setSlideDirection("right");
    setCurrentStep("avatar");
  };

  const handleBackToLanguage = () => {
    setSlideDirection("right");
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
        <p
          key={currentStep}
          className="text-muted-foreground animate-in fade-in duration-300"
        >
          {getStepSubtitle()}
        </p>
      </div>

      {/* Step indicator with connected line */}
      <StepIndicator currentStep={currentStep} />

      {/* Content with slide transitions */}
      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div
            ref={contentRef}
            key={currentStep}
            className={cn(
              "animate-in duration-300 fill-mode-both",
              slideDirection === "left"
                ? "fade-in slide-in-from-right-4"
                : "fade-in slide-in-from-left-4"
            )}
          >
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
