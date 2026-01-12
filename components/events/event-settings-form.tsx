"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Users, Shield, Loader2, Check, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { EventSettings, MomentsWhoCanPost } from "@/lib/types";

interface EventSettingsFormProps {
  eventId: string;
  eventSlug: string;
  initialSettings: EventSettings | null;
  pendingCount: number;
}

export function EventSettingsForm({
  eventId,
  eventSlug,
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
    initialSettings?.moments_enabled ?? false
  );
  const [whoCanPost, setWhoCanPost] = useState<MomentsWhoCanPost>(
    initialSettings?.moments_who_can_post ?? "anyone"
  );
  const [requireApproval, setRequireApproval] = useState(
    initialSettings?.moments_require_approval ?? false
  );

  const handleSave = () => {
    triggerHaptic("selection");
    const supabase = createClient();

    startTransition(async () => {
      const { error } = await supabase.from("event_settings").upsert(
        {
          event_id: eventId,
          moments_enabled: momentsEnabled,
          moments_who_can_post: whoCanPost,
          moments_require_approval: requireApproval,
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
  };

  const whoCanPostOptions: { value: MomentsWhoCanPost; label: string; description: string }[] = [
    { value: "anyone", label: t("whoCanPost.anyone"), description: t("whoCanPost.anyoneDescription") },
    { value: "rsvp", label: t("whoCanPost.rsvp"), description: t("whoCanPost.rsvpDescription") },
    { value: "confirmed", label: t("whoCanPost.confirmed"), description: t("whoCanPost.confirmedDescription") },
  ];

  return (
    <div className="space-y-6">
      {/* Moments Toggle */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic("selection");
          setMomentsEnabled(!momentsEnabled);
        }}
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
                onClick={() => {
                  triggerHaptic("selection");
                  setWhoCanPost(option.value);
                }}
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
          onClick={() => {
            triggerHaptic("selection");
            setRequireApproval(!requireApproval);
          }}
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

      {/* Save Button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className={cn(
          "w-full flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition-all duration-200",
          saved
            ? "bg-green-600 text-white"
            : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
        )}
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("saving")}
          </>
        ) : saved ? (
          <>
            <Check className="w-4 h-4" />
            {t("saved")}
          </>
        ) : (
          t("saveSettings")
        )}
      </button>
    </div>
  );
}
