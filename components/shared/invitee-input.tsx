"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserSearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export type Invitee =
  | { type: "email"; email: string; name?: string }
  | { type: "user"; user: UserSearchResult };

interface InviteeInputProps {
  invitees: Invitee[];
  onInviteesChange: (invitees: Invitee[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InviteeInput({
  invitees,
  onInviteesChange,
  disabled = false,
  placeholder,
}: InviteeInputProps) {
  const t = useTranslations("invite");
  const [inputValue, setInputValue] = useState("");
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-detect input mode: email if contains @domain.tld pattern, username otherwise
  const isEmailInput = useCallback((value: string) => {
    // If starts with @ (like @username), it's a username search
    if (value.startsWith("@")) return false;
    // If contains email pattern (@something.something), it's email
    return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value);
  }, []);

  const inputMode = isEmailInput(inputValue) ? "email" : "username";

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
      onInviteesChange([...invitees, { type: "user", user }]);
    }
    setInputValue("");
    setShowDropdown(false);
    setUserResults([]);
    inputRef.current?.focus();
  }, [invitees, onInviteesChange]);

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
      onInviteesChange([...invitees, ...uniqueNew]);
    }
    setInputValue("");
  }, [inputValue, invitees, parseEmails, isEmailInput, onInviteesChange]);

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
    onInviteesChange(invitees.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            type="text"
            placeholder={placeholder || t("smartPlaceholder")}
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
            disabled={disabled}
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
            disabled={!inputValue.trim() || disabled}
          >
            {t("add")}
          </Button>
        )}
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
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
