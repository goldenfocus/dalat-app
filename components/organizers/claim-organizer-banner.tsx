"use client";

import { useState } from "react";
import { Building2, Send, CheckCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface ClaimOrganizerBannerProps {
  organizerSlug: string;
  organizerName: string;
  eventCount: number;
}

export function ClaimOrganizerBanner({
  organizerSlug,
  organizerName,
  eventCount,
}: ClaimOrganizerBannerProps) {
  const t = useTranslations("organizer");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function handleSubmit() {
    setStatus("loading");
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "organizer",
          entitySlug: organizerSlug,
          entityName: organizerName,
          message: message || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) {
          // Not logged in - redirect to sign in
          window.location.href = `/sign-in?redirect=/${organizerSlug}`;
          return;
        }
        throw new Error(data.error || "Failed to submit");
      }

      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 mb-6">
        <div className="flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-green-700 dark:text-green-300">
              {t("claimBanner.successTitle")}
            </h3>
            <p className="text-sm text-green-600/90 dark:text-green-400/90 mt-1">
              {t("claimBanner.successDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 border-dashed mb-6">
      <div className="flex items-start gap-3">
        <Building2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-foreground">
            {t("claimBanner.title")}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t("claimBanner.description", {
              name: organizerName,
              count: eventCount,
            })}
          </p>

          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all text-sm font-medium"
            >
              <Send className="h-4 w-4" />
              {t("claimBanner.button")}
            </button>
          ) : (
            <div className="mt-3 space-y-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("claimBanner.messagePlaceholder")}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={status === "loading"}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all text-sm font-medium disabled:opacity-50"
                >
                  {status === "loading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {t("claimBanner.submitRequest")}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-md border border-border hover:bg-muted active:scale-95 transition-all text-sm"
                >
                  {t("claimBanner.cancel")}
                </button>
              </div>
              {status === "error" && (
                <p className="text-sm text-destructive">
                  {t("claimBanner.error")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Badge for unclaimed organizer status
interface UnclaimedOrganizerBadgeProps {
  className?: string;
}

export function UnclaimedOrganizerBadge({
  className,
}: UnclaimedOrganizerBadgeProps) {
  const t = useTranslations("organizer");

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border ${className ?? ""}`}
    >
      <Building2 className="h-3 w-3" />
      {t("claimBanner.unclaimed")}
    </span>
  );
}
