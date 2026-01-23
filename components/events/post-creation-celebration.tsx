"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import confetti from "canvas-confetti";
import {
  PartyPopper,
  X,
  Send,
  Loader2,
  Check,
  Copy,
  MessageCircle,
  ChevronDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PostCreationCelebrationProps {
  isOpen: boolean;
  onClose: () => void;
  eventSlug: string;
  eventTitle: string;
  eventDescription: string | null;
  startsAt: string;
}

interface InviteResult {
  email: string;
  success: boolean;
  error?: string;
}

export function PostCreationCelebration({
  isOpen,
  onClose,
  eventSlug,
  eventTitle,
  eventDescription,
  startsAt,
}: PostCreationCelebrationProps) {
  const router = useRouter();
  const t = useTranslations("celebration");
  const tInvite = useTranslations("invite");
  const [confettiFired, setConfettiFired] = useState(false);

  // Copy link state
  const [copied, setCopied] = useState(false);

  // Email invite state
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<Array<{ email: string }>>([]);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<InviteResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const eventUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/events/${eventSlug}`
      : `/events/${eventSlug}`;

  // Format date for share message
  const eventDate = new Date(startsAt);
  const formattedDate = eventDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // Truncate description to ~100 chars at word boundary
  const truncateDescription = (desc: string | null, maxLength = 100) => {
    if (!desc) return null;
    if (desc.length <= maxLength) return desc;
    const truncated = desc.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    return lastSpace > 0 ? truncated.slice(0, lastSpace) + "..." : truncated + "...";
  };

  const descriptionSnippet = truncateDescription(eventDescription);

  const shareMessage = [
    "🎉 You're invited!",
    "",
    eventTitle,
    `📅 ${formattedDate}`,
    descriptionSnippet ? "" : null,
    descriptionSnippet,
    "",
    `👉 ${eventUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const encodedMessage = encodeURIComponent(shareMessage);
  const encodedUrl = encodeURIComponent(eventUrl);

  // Fire confetti on open
  useEffect(() => {
    if (isOpen && !confettiFired) {
      fireConfetti();
      setConfettiFired(true);
    }
  }, [isOpen, confettiFired]);

  const fireConfetti = () => {
    // Burst from both sides for maximum celebration
    const duration = 2000;
    const animationEnd = Date.now() + duration;

    const randomInRange = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      // Left burst
      confetti({
        particleCount,
        startVelocity: 30,
        spread: 60,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ["#ff6b6b", "#4ecdc4", "#ffe66d", "#95e1d3", "#f38181"],
      });

      // Right burst
      confetti({
        particleCount,
        startVelocity: 30,
        spread: 60,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ["#ff6b6b", "#4ecdc4", "#ffe66d", "#95e1d3", "#f38181"],
      });
    }, 250);
  };

  // Parse emails from input
  const parseEmails = useCallback((input: string) => {
    const emailRegex = /[^\s,;]+@[^\s,;]+\.[^\s,;]+/g;
    const matches = input.match(emailRegex) || [];
    return matches.map((email) => ({ email: email.toLowerCase().trim() }));
  }, []);

  const handleAddEmails = useCallback(() => {
    if (!emailInput.trim()) return;

    const newEmails = parseEmails(emailInput);
    const existingSet = new Set(emails.map((e) => e.email));
    const uniqueNew = newEmails.filter((e) => !existingSet.has(e.email));

    if (uniqueNew.length > 0) {
      setEmails((prev) => [...prev, ...uniqueNew]);
    }
    setEmailInput("");
    setError(null);
  }, [emailInput, emails, parseEmails]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddEmails();
    }
  };

  const removeEmail = (emailToRemove: string) => {
    setEmails((prev) => prev.filter((e) => e.email !== emailToRemove));
  };

  const handleSendInvites = async () => {
    if (emails.length === 0) {
      setError(tInvite("noEmails"));
      return;
    }

    setSending(true);
    setError(null);
    setResults([]);

    try {
      const response = await fetch(`/api/events/${eventSlug}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setError(tInvite("quotaExceeded", { remaining: data.remaining_daily || 0 }));
        } else if (response.status === 403) {
          setError(tInvite("notAuthorized"));
        } else {
          setError(data.error || tInvite("sendFailed"));
        }
        return;
      }

      setResults(data.results);

      // Clear successful emails from the list
      const failedEmails = data.results
        .filter((r: InviteResult) => !r.success)
        .map((r: InviteResult) => r.email);
      setEmails(emails.filter((e) => failedEmails.includes(e.email)));
    } catch {
      setError(tInvite("sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(eventUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");
  };

  const handleZalo = () => {
    window.open(`https://zalo.me/share?url=${encodedUrl}`, "_blank");
  };

  const handleClose = () => {
    onClose();
    setConfettiFired(false);
    setEmailInput("");
    setEmails([]);
    setResults([]);
    setError(null);
    router.push(`/events/${eventSlug}`);
    router.refresh();
  };

  const successCount = results.filter((r) => r.success).length;
  const hasResults = results.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
            <PartyPopper className="w-8 h-8 text-white" />
          </div>
          <DialogTitle className="text-2xl">{t("title")}</DialogTitle>
          <p className="text-xl font-semibold text-foreground mt-2">{eventTitle}</p>
          <DialogDescription className="text-base mt-1">
            {t("subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Quick Share Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t("quickShare")}</Label>
            <div className="flex flex-wrap gap-2">
              {/* WhatsApp */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleWhatsApp}
                className="gap-2 flex-1 min-w-[100px] active:scale-95 transition-transform"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </Button>

              {/* Zalo */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleZalo}
                className="gap-2 flex-1 min-w-[100px] active:scale-95 transition-transform"
              >
                <MessageCircle className="w-4 h-4" />
                Zalo
              </Button>

              {/* Copy link */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="gap-2 flex-1 min-w-[100px] active:scale-95 transition-transform"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-500" />
                    {t("copied")}
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    {t("copyLink")}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Collapsible Email Invites Section */}
          <details className="group border rounded-lg">
            <summary className="flex items-center justify-between cursor-pointer py-3 px-4 text-sm font-medium hover:bg-muted/50 transition-colors rounded-lg">
              <span className="flex items-center gap-2">
                <Send className="w-4 h-4" />
                {t("personalInvitesTitle")}
              </span>
              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("emailDescription")}
              </p>

              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder={t("emailPlaceholder")}
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleAddEmails}
                  disabled={sending}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddEmails}
                  disabled={!emailInput.trim() || sending}
                >
                  {t("addEmails")}
                </Button>
              </div>

              {/* Email chips */}
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {emails.map(({ email }) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-sm"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => removeEmail(email)}
                        className="hover:text-destructive p-0.5"
                        disabled={sending}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Error message */}
              {error && <p className="text-sm text-destructive">{error}</p>}

              {/* Results */}
              {hasResults && (
                <div className="space-y-2 p-3 bg-muted rounded-lg">
                  {successCount > 0 && (
                    <p className="text-sm text-green-600 flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      {t("sentSuccess", { count: successCount })}
                    </p>
                  )}
                  {results
                    .filter((r) => !r.success)
                    .map((r) => (
                      <p
                        key={r.email}
                        className="text-sm text-destructive flex items-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        {r.email}: {r.error}
                      </p>
                    ))}
                </div>
              )}

              {/* Send button */}
              {emails.length > 0 && (
                <Button
                  onClick={handleSendInvites}
                  disabled={emails.length === 0 || sending}
                  className="w-full gap-2"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("sending")}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      {t("sendInvites", { count: emails.length })}
                    </>
                  )}
                </Button>
              )}
            </div>
          </details>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={handleClose} className="w-full">
              {t("viewEvent")}
            </Button>
            <Button
              variant="ghost"
              onClick={handleClose}
              className="w-full text-muted-foreground"
            >
              {t("skipForNow")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
