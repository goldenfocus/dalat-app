"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Camera, Users, Shield, Loader2, Check, ChevronRight, Languages, Clock, ChevronDown, ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { triggerHaptic } from "@/lib/haptics";
import { triggerTranslation } from "@/lib/translations-client";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { EventSettings, MomentsWhoCanPost } from "@/lib/types";

// Duration preset types
type DurationPreset = "2h" | "4h" | "6h" | "all_day" | "multi_day" | "custom";

// Calculate duration in hours from starts_at and ends_at
function calculateDurationHours(startsAt: string, endsAt: string | null): number | null {
  if (!endsAt) return null; // Default 4 hours
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

// Determine which preset matches the current duration
function getDurationPreset(hours: number | null): DurationPreset {
  if (hours === null) return "4h"; // Default
  if (hours === 2) return "2h";
  if (hours === 4) return "4h";
  if (hours === 6) return "6h";
  if (hours === 24) return "all_day";
  if (hours > 24 && hours % 24 === 0) return "multi_day";
  return "custom";
}

// Calculate ends_at from starts_at and duration hours
function calculateEndsAt(startsAt: string, hours: number): string {
  const start = new Date(startsAt);
  return new Date(start.getTime() + hours * 60 * 60 * 1000).toISOString();
}

interface EventSettingsFormProps {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventDescription: string | null;
  startsAt: string;
  endsAt: string | null;
  initialSettings: EventSettings | null;
  pendingCount: number;
}

export function EventSettingsForm({
  eventId,
  eventSlug,
  eventTitle,
  eventDescription,
  startsAt,
  endsAt,
  initialSettings,
  pendingCount,
}: EventSettingsFormProps) {
  const router = useRouter();
  const t = useTranslations("eventSettings");
  const tModeration = useTranslations("moments.moderation");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Form state
  const [momentsEnabled, setMomentsEnabled] = useState(
    initialSettings?.moments_enabled ?? true
  );
  const [whoCanPost, setWhoCanPost] = useState<MomentsWhoCanPost>(
    initialSettings?.moments_who_can_post ?? "anyone"
  );
  const [requireApproval, setRequireApproval] = useState(
    initialSettings?.moments_require_approval ?? false
  );
  const [isRetranslating, setIsRetranslating] = useState(false);
  const [retranslated, setRetranslated] = useState(false);

  // Duration state
  const currentDurationHours = calculateDurationHours(startsAt, endsAt);
  const [durationPreset, setDurationPreset] = useState<DurationPreset>(
    getDurationPreset(currentDurationHours)
  );
  const [multiDayCount, setMultiDayCount] = useState(
    currentDurationHours && currentDurationHours > 24
      ? Math.round(currentDurationHours / 24)
      : 2
  );
  const [isSavingDuration, setIsSavingDuration] = useState(false);
  const [durationSaved, setDurationSaved] = useState(false);

  // Save duration to events table
  const saveDuration = useCallback(
    async (hours: number) => {
      const supabase = createClient();
      setIsSavingDuration(true);

      const newEndsAt = calculateEndsAt(startsAt, hours);
      const { error } = await supabase
        .from("events")
        .update({ ends_at: newEndsAt })
        .eq("id", eventId);

      setIsSavingDuration(false);

      if (error) {
        console.error("Failed to save duration:", error);
        return;
      }

      setDurationSaved(true);
      setTimeout(() => setDurationSaved(false), 2000);
      triggerHaptic("success");
      router.refresh();
    },
    [eventId, startsAt, router]
  );

  // Handle duration preset change
  const handleDurationChange = useCallback(
    (preset: DurationPreset, days?: number) => {
      setDurationPreset(preset);
      triggerHaptic("selection");

      let hours: number;
      switch (preset) {
        case "2h":
          hours = 2;
          break;
        case "4h":
          hours = 4;
          break;
        case "6h":
          hours = 6;
          break;
        case "all_day":
          hours = 24;
          break;
        case "multi_day":
          hours = (days ?? multiDayCount) * 24;
          if (days) setMultiDayCount(days);
          break;
        default:
          return; // Custom - don't auto-save
      }

      saveDuration(hours);
    },
    [multiDayCount, saveDuration]
  );

  // Auto-save function - called whenever a setting changes
  const saveSettings = useCallback(
    (updates: {
      moments_enabled?: boolean;
      moments_who_can_post?: MomentsWhoCanPost;
      moments_require_approval?: boolean;
    }) => {
      const supabase = createClient();

      startTransition(async () => {
        const { error } = await supabase.from("event_settings").upsert(
          {
            event_id: eventId,
            moments_enabled: updates.moments_enabled ?? momentsEnabled,
            moments_who_can_post: updates.moments_who_can_post ?? whoCanPost,
            moments_require_approval: updates.moments_require_approval ?? requireApproval,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "event_id" }
        );

        if (error) {
          console.error("Failed to save settings:", error);
          return;
        }

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      });
    },
    [eventId, momentsEnabled, whoCanPost, requireApproval, router]
  );

  // Handlers that update state AND auto-save
  const handleMomentsToggle = () => {
    const newValue = !momentsEnabled;
    triggerHaptic("selection");
    setMomentsEnabled(newValue);
    saveSettings({ moments_enabled: newValue });
  };

  const handleWhoCanPostChange = (value: MomentsWhoCanPost) => {
    triggerHaptic("selection");
    setWhoCanPost(value);
    saveSettings({ moments_who_can_post: value });
  };

  const handleRequireApprovalToggle = () => {
    const newValue = !requireApproval;
    triggerHaptic("selection");
    setRequireApproval(newValue);
    saveSettings({ moments_require_approval: newValue });
  };

  const whoCanPostOptions: { value: MomentsWhoCanPost; label: string; description: string }[] = [
    { value: "anyone", label: t("whoCanPost.anyone"), description: t("whoCanPost.anyoneDescription") },
    { value: "rsvp", label: t("whoCanPost.rsvp"), description: t("whoCanPost.rsvpDescription") },
    { value: "confirmed", label: t("whoCanPost.confirmed"), description: t("whoCanPost.confirmedDescription") },
  ];

  return (
    <div className="space-y-6">
      {/* Save Status Indicator */}
      {(isPending || saved) && (
        <div className="flex items-center justify-center gap-2 text-sm animate-in fade-in duration-200">
          {isPending ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">{t("saving")}</span>
            </>
          ) : (
            <>
              <Check className="w-3 h-3 text-green-600" />
              <span className="text-green-600">{t("saved")}</span>
            </>
          )}
        </div>
      )}

      {/* Duration Settings - Collapsible for low cognitive load */}
      <Collapsible>
        <CollapsibleTrigger className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-all duration-200 [&[data-state=open]>svg:last-child]:rotate-180">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">
                {t("duration.title")}
              </p>
              <p className="text-xs text-muted-foreground">
                {durationPreset === "2h" && t("duration.preset2h")}
                {durationPreset === "4h" && t("duration.preset4h")}
                {durationPreset === "6h" && t("duration.preset6h")}
                {durationPreset === "all_day" && t("duration.presetAllDay")}
                {durationPreset === "multi_day" && t("duration.presetMultiDay", { days: multiDayCount })}
                {durationPreset === "custom" && t("duration.presetCustom")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(isSavingDuration || durationSaved) && (
              <span className="text-xs">
                {isSavingDuration ? (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                ) : (
                  <Check className="w-3 h-3 text-green-600" />
                )}
              </span>
            )}
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200" />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-3 pl-4 border-l-2 border-muted ml-2">
            {/* Duration presets */}
            <div className="flex flex-wrap gap-2">
              {(["2h", "4h", "6h", "all_day"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleDurationChange(preset)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full transition-all",
                    durationPreset === preset
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {preset === "2h" && t("duration.preset2h")}
                  {preset === "4h" && t("duration.preset4h")}
                  {preset === "6h" && t("duration.preset6h")}
                  {preset === "all_day" && t("duration.presetAllDay")}
                </button>
              ))}
            </div>

            {/* Multi-day option */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleDurationChange("multi_day")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-full transition-all",
                  durationPreset === "multi_day"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {t("duration.multiDay")}
              </button>
              {durationPreset === "multi_day" && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
                  <input
                    type="number"
                    min="2"
                    max="14"
                    value={multiDayCount}
                    onChange={(e) => {
                      const days = Math.max(2, Math.min(14, parseInt(e.target.value) || 2));
                      handleDurationChange("multi_day", days);
                    }}
                    className="w-16 px-2 py-1 text-sm border rounded-md bg-background"
                  />
                  <span className="text-xs text-muted-foreground">{t("duration.days")}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground pt-1">
              {t("duration.description")}
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Moments Toggle */}
      <button
        type="button"
        onClick={handleMomentsToggle}
        className={cn(
          "w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all duration-200",
          momentsEnabled
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <div className="flex items-center gap-3">
          <Camera
            className={cn(
              "w-5 h-5",
              momentsEnabled ? "text-primary" : "text-muted-foreground"
            )}
          />
          <div className="text-left">
            <p
              className={cn(
                "text-sm font-medium",
                momentsEnabled ? "text-primary" : "text-foreground"
              )}
            >
              {t("enableMoments")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("enableMomentsDescription")}
            </p>
          </div>
        </div>
        <div
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            momentsEnabled ? "bg-primary" : "bg-muted"
          )}
        >
          <div
            className={cn(
              "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm",
              momentsEnabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </div>
      </button>

      {/* Who Can Post - Only shown when moments enabled */}
      {momentsEnabled && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Users className="w-4 h-4" />
            {t("whoCanPostTitle")}
          </div>
          <div className="space-y-2">
            {whoCanPostOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleWhoCanPostChange(option.value)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg border transition-all duration-200",
                  whoCanPost === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                )}
              >
                <div className="text-left">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      whoCanPost === option.value ? "text-primary" : "text-foreground"
                    )}
                  >
                    {option.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
                {whoCanPost === option.value && (
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Require Approval Toggle - Only shown when moments enabled */}
      {momentsEnabled && (
        <button
          type="button"
          onClick={handleRequireApprovalToggle}
          className={cn(
            "w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all duration-200 animate-in fade-in slide-in-from-top-2",
            requireApproval
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
          )}
        >
          <div className="flex items-center gap-3">
            <Shield
              className={cn(
                "w-5 h-5",
                requireApproval ? "text-primary" : "text-muted-foreground"
              )}
            />
            <div className="text-left">
              <p
                className={cn(
                  "text-sm font-medium",
                  requireApproval ? "text-primary" : "text-foreground"
                )}
              >
                {t("requireApproval")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("requireApprovalDescription")}
              </p>
            </div>
          </div>
          <div
            className={cn(
              "w-11 h-6 rounded-full transition-colors relative",
              requireApproval ? "bg-primary" : "bg-muted"
            )}
          >
            <div
              className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm",
                requireApproval ? "translate-x-6" : "translate-x-1"
              )}
            />
          </div>
        </button>
      )}

      {/* Moderation Queue Link - Only shown when require approval is enabled */}
      {momentsEnabled && requireApproval && (
        <Link
          href={`/events/${eventSlug}/moderation`}
          className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-all duration-200 animate-in fade-in slide-in-from-top-2 active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-muted-foreground" />
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">
                {tModeration("viewQueue")}
              </p>
              {pendingCount > 0 && (
                <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                  {tModeration("pendingCount", { count: pendingCount })}
                </p>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>
      )}

      {/* Questionnaire Builder Link */}
      <Link
        href={`/events/${eventSlug}/questionnaire`}
        className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-all duration-200 active:scale-[0.98]"
      >
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-muted-foreground" />
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">
              {t("questionnaire.title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("questionnaire.description")}
            </p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </Link>

      {/* Retranslate Button */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic("selection");
          setIsRetranslating(true);
          setRetranslated(false);

          const fields: { field_name: "title" | "description"; text: string }[] = [
            { field_name: "title", text: eventTitle },
          ];
          if (eventDescription) {
            fields.push({ field_name: "description", text: eventDescription });
          }

          triggerTranslation("event", eventId, fields);

          // Show success after a short delay (translation happens in background)
          setTimeout(() => {
            setIsRetranslating(false);
            setRetranslated(true);
            setTimeout(() => setRetranslated(false), 3000);
          }, 1500);
        }}
        disabled={isRetranslating}
        className={cn(
          "w-full flex items-center justify-between p-4 rounded-lg border transition-all duration-200",
          retranslated
            ? "border-green-500 bg-green-500/10"
            : "border-border hover:border-primary/50 hover:bg-muted/50 active:scale-[0.98]"
        )}
      >
        <div className="flex items-center gap-3">
          <Languages
            className={cn(
              "w-5 h-5",
              retranslated ? "text-green-500" : "text-muted-foreground"
            )}
          />
          <div className="text-left">
            <p
              className={cn(
                "text-sm font-medium",
                retranslated ? "text-green-600 dark:text-green-400" : "text-foreground"
              )}
            >
              {retranslated ? t("retranslated") : t("retranslate")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("retranslateDescription")}
            </p>
          </div>
        </div>
        {isRetranslating ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : retranslated ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : null}
      </button>
    </div>
  );
}
