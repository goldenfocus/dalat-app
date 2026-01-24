"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Send, Loader2, Check, X, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShareButtons } from "./share-buttons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InviteSendingAnimation } from "./invite-sending-animation";
import { InviteCelebration } from "./invite-celebration";

interface InviteModalProps {
  eventSlug: string;
  eventTitle: string;
  eventDescription: string | null;
  startsAt: string;
  imageUrl?: string | null;
}

interface InviteResult {
  email?: string;
  userId?: string;
  success: boolean;
  error?: string;
}

interface UserSearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

type Invitee =
  | { type: "email"; email: string; name?: string }
  | { type: "user"; user: UserSearchResult };

export function InviteModal({ eventSlug, eventTitle, eventDescription, startsAt, imageUrl }: InviteModalProps) {
  const t = useTranslations("invite");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<InviteResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Auto-detect input mode: email if contains @domain.tld pattern, username otherwise
  const isEmailInput = useCallback((value: string) => {
    // If starts with @ (like @username), it's a username search
    if (value.startsWith("@")) return false;
    // If contains email pattern (@something.something), it's email
    return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value);
  }, []);

  const inputMode = isEmailInput(inputValue) ? "email" : "username";

  // User search state
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const eventUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${eventSlug}`;

  // Format date for WhatsApp share message
  const eventDate = new Date(startsAt);
  const formattedDate = eventDate.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // Truncate description for share message
  const truncateDescription = (desc: string | null, maxLength = 100) => {
    if (!desc) return null;
    if (desc.length <= maxLength) return desc;
    const truncated = desc.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    return lastSpace > 0 ? truncated.slice(0, lastSpace) + "..." : truncated + "...";
  };

  const descriptionSnippet = truncateDescription(eventDescription);

  const handleWhatsApp = () => {
    const shareMessage = [
      `🎉 ${t("youreInvited")}`,
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
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, "_blank");
  };

  // Username search is active when not typing an email and has 2+ chars
  const isUsernameSearch = !isEmailInput(inputValue) && inputValue.length >= 2;

  // Debounced user search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!isUsernameSearch) {
      setUserResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        // Don't need @ prefix - just pass the search query directly
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(inputValue.replace(/^@/, ""))}`);
        const data = await response.json();
        setUserResults(data.users || []);
        setShowDropdown(data.users?.length > 0);
        setSelectedIndex(0);
      } catch {
        setUserResults([]);
        setShowDropdown(false);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [inputValue, isUsernameSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  type EmailInvitee = Extract<Invitee, { type: "email" }>;

  const parseEmails = useCallback((input: string): EmailInvitee[] => {
    // Parse comma, semicolon, newline, or space separated emails
    const emailRegex = /[^\s,;]+@[^\s,;]+\.[^\s,;]+/g;
    const matches = input.match(emailRegex) || [];
    return matches.map(email => ({ type: "email" as const, email: email.toLowerCase().trim() }));
  }, []);

  const addUser = useCallback((user: UserSearchResult) => {
    // Check if user already added
    const alreadyAdded = invitees.some(
      inv => inv.type === "user" && inv.user.id === user.id
    );
    if (!alreadyAdded) {
      setInvitees(prev => [...prev, { type: "user", user }]);
    }
    setInputValue("");
    setShowDropdown(false);
    setUserResults([]);
    setError(null);
    inputRef.current?.focus();
  }, [invitees]);

  const handleAddEmails = useCallback(() => {
    if (!inputValue.trim()) return;
    // Only add if it looks like an email
    if (!isEmailInput(inputValue)) return;

    const newEmails = parseEmails(inputValue);
    const existingEmails = new Set(
      invitees
        .filter((inv): inv is Invitee & { type: "email" } => inv.type === "email")
        .map(inv => inv.email)
    );
    const uniqueNew = newEmails.filter(inv => !existingEmails.has(inv.email));

    if (uniqueNew.length > 0) {
      setInvitees(prev => [...prev, ...uniqueNew]);
    }
    setInputValue("");
    setError(null);
  }, [inputValue, invitees, parseEmails, isEmailInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle dropdown navigation
    if (showDropdown && userResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, userResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        addUser(userResults[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }

    // Add emails on Enter or comma
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddEmails();
    }
  };

  const removeInvitee = (index: number) => {
    setInvitees(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendInvites = async () => {
    // Auto-add any email still in the input before sending
    let finalInvitees = [...invitees];
    if (isEmailInput(inputValue) && inputValue.trim()) {
      const newEmails = parseEmails(inputValue);
      const existingEmails = new Set(
        finalInvitees
          .filter((inv): inv is Invitee & { type: "email" } => inv.type === "email")
          .map(inv => inv.email)
      );
      const uniqueNew = newEmails.filter(inv => !existingEmails.has(inv.email));
      if (uniqueNew.length > 0) {
        finalInvitees = [...finalInvitees, ...uniqueNew];
        setInvitees(finalInvitees);
      }
      setInputValue("");
    }

    if (finalInvitees.length === 0) {
      setError(t("noInvitees"));
      return;
    }

    setSending(true);
    setError(null);
    setResults([]);

    // Separate email and user invitees
    const emailInvitees = finalInvitees
      .filter((inv): inv is Invitee & { type: "email" } => inv.type === "email")
      .map(inv => ({ email: inv.email, name: inv.name }));
    const userInvitees = finalInvitees
      .filter((inv): inv is Invitee & { type: "user" } => inv.type === "user")
      .map(inv => ({ userId: inv.user.id, username: inv.user.username }));

    try {
      const response = await fetch(`/api/events/${eventSlug}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: emailInvitees, users: userInvitees }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setError(t("quotaExceeded", { remaining: data.remaining_daily || 0 }));
        } else if (response.status === 403) {
          setError(t("notAuthorized"));
        } else {
          setError(data.error || t("sendFailed"));
        }
        return;
      }

      setResults(data.results);

      // Clear successful invitees from the list
      const failedEmails = new Set(
        data.results.filter((r: InviteResult) => !r.success && r.email).map((r: InviteResult) => r.email)
      );
      const failedUserIds = new Set(
        data.results.filter((r: InviteResult) => !r.success && r.userId).map((r: InviteResult) => r.userId)
      );

      setInvitees(invitees.filter(inv => {
        if (inv.type === "email") return failedEmails.has(inv.email);
        if (inv.type === "user") return failedUserIds.has(inv.user.id);
        return false;
      }));

      // Show celebration if any invites succeeded
      const sentSuccessfully = data.results.filter((r: InviteResult) => r.success).length;
      if (sentSuccessfully > 0) {
        // Small delay to let the animation complete before showing celebration
        setTimeout(() => {
          setSending(false);
          setShowCelebration(true);
        }, 1500);
        return; // Don't set sending to false yet
      }

    } catch {
      setError(t("sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when closing
      setInputValue("");
      setInvitees([]);
      setResults([]);
      setError(null);
      setUserResults([]);
      setShowDropdown(false);
      setShowCelebration(false);
    }
  };

  // Handle celebration complete - close the modal
  const handleCelebrationComplete = () => {
    setShowCelebration(false);
    setOpen(false);
  };

  const successCount = results.filter(r => r.success).length;
  const hasResults = results.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserPlus className="w-4 h-4" />
          {t("inviteGuests")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("inviteGuests")}</DialogTitle>
        </DialogHeader>

        {/* Show animation when sending, otherwise show form */}
        {sending ? (
          <InviteSendingAnimation
            invitees={invitees}
            results={results.length > 0 ? results : null}
          />
        ) : (
        <div className="space-y-4 py-4">
          {/* Share buttons */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t("shareVia")}</Label>

            {/* Primary: Native Share + Copy Link */}
            <ShareButtons
              eventUrl={eventUrl}
              eventTitle={eventTitle}
              eventDescription={eventDescription}
              startsAt={startsAt}
              imageUrl={imageUrl}
            />

            {/* Secondary: WhatsApp quick access */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleWhatsApp}
              className="w-full gap-2 text-muted-foreground active:scale-95 transition-transform"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </Button>
          </div>

          {/* Input section */}
          <div className="space-y-2">
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Input
                  ref={inputRef}
                  id="invite-input"
                  type="text"
                  placeholder={t("smartPlaceholder")}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={(e) => {
                    // Don't add emails if clicking the Add button (it will handle it)
                    const relatedTarget = e.relatedTarget as HTMLElement | null;
                    if (relatedTarget?.closest('button')) return;

                    // Delay to allow click on dropdown
                    setTimeout(() => {
                      if (!showDropdown && isEmailInput(inputValue)) handleAddEmails();
                    }, 150);
                  }}
                  disabled={sending}
                  className={isUsernameSearch ? "pr-8" : ""}
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}

                {/* User search dropdown */}
                {showDropdown && userResults.length > 0 && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg overflow-hidden"
                  >
                    {userResults.map((user, index) => (
                      <button
                        key={user.id}
                        type="button"
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors ${
                          index === selectedIndex ? "bg-accent" : ""
                        }`}
                        onClick={() => addUser(user)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={user.avatarUrl || undefined} />
                          <AvatarFallback>
                            {(user.displayName || user.username)?.[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          {user.displayName && (
                            <p className="text-sm font-medium truncate">
                              {user.displayName}
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground truncate">
                            @{user.username}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {inputMode === "email" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddEmails}
                  disabled={!inputValue.trim() || sending}
                >
                  {t("add")}
                </Button>
              )}
            </div>
          </div>

          {/* Invitee chips */}
          {invitees.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {invitees.map((inv, index) => (
                <span
                  key={inv.type === "email" ? inv.email : inv.user.id}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm ${
                    inv.type === "user"
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {inv.type === "user" && (
                    <Avatar className="w-4 h-4">
                      <AvatarImage src={inv.user.avatarUrl || undefined} />
                      <AvatarFallback className="text-[10px]">
                        {(inv.user.displayName || inv.user.username)?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  {inv.type === "user" ? (
                    <span className="flex items-center gap-1">
                      <span className="font-medium">{inv.user.displayName || `@${inv.user.username}`}</span>
                      {inv.user.displayName && (
                        <span className="text-xs text-muted-foreground">@{inv.user.username}</span>
                      )}
                    </span>
                  ) : (
                    inv.email
                  )}
                  <button
                    type="button"
                    onClick={() => removeInvitee(index)}
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
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Results */}
          {hasResults && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              {successCount > 0 && (
                <p className="text-sm text-green-600 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {t("sentSuccess", { count: successCount })}
                </p>
              )}
              {results.filter(r => !r.success).map((r, idx) => (
                <p key={r.email || r.userId || idx} className="text-sm text-destructive flex items-center gap-2">
                  <X className="w-4 h-4" />
                  {r.email || r.userId}: {r.error}
                </p>
              ))}
            </div>
          )}

          {/* Send button */}
          <Button
            onClick={handleSendInvites}
            disabled={invitees.length === 0 || sending}
            className="w-full gap-2"
          >
            <Send className="w-4 h-4" />
            {t("sendInvites", { count: invitees.length })}
          </Button>
        </div>
        )}
      </DialogContent>

      {/* Celebration overlay */}
      {showCelebration && successCount > 0 && (
        <InviteCelebration
          successCount={successCount}
          onComplete={handleCelebrationComplete}
        />
      )}
    </Dialog>
  );
}
