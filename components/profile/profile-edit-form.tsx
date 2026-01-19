"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarUpload } from "./avatar-upload";
import { AIAvatarDialog } from "./ai-avatar-dialog";
import { cn } from "@/lib/utils";
import { triggerTranslation } from "@/lib/translations-client";
import type { Profile } from "@/lib/types";

interface ProfileEditFormProps {
  profile: Profile;
}

const BIO_MAX_LENGTH = 160;

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function ProfileEditForm({ profile }: ProfileEditFormProps) {
  const router = useRouter();
  const t = useTranslations("profile");
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Form state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [username, setUsername] = useState(profile.username || "");
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [bio, setBio] = useState(profile.bio || "");

  // Track last saved values to avoid redundant saves
  const lastSavedRef = useRef({
    username: profile.username || "",
    displayName: profile.display_name || "",
    bio: profile.bio || "",
  });

  // Validation state
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // Autosave function
  const saveProfile = useCallback(
    async (fields: { username?: string; displayName?: string; bio?: string }) => {
      setSaveStatus("saving");
      setError(null);

      const supabase = createClient();
      const updates: Partial<Profile> = {};

      if (fields.username !== undefined && fields.username !== lastSavedRef.current.username) {
        updates.username = fields.username || null;
      }
      if (fields.displayName !== undefined && fields.displayName !== lastSavedRef.current.displayName) {
        updates.display_name = fields.displayName.trim() || null;
      }
      if (fields.bio !== undefined && fields.bio !== lastSavedRef.current.bio) {
        updates.bio = fields.bio.trim() || null;
      }

      // Nothing to save
      if (Object.keys(updates).length === 0) {
        setSaveStatus("idle");
        return;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", profile.id);

      if (updateError) {
        setSaveStatus("error");
        if (updateError.message.includes("valid_username")) {
          setError("Invalid username format");
        } else if (updateError.message.includes("unique")) {
          setError("Username is already taken");
        } else {
          setError(updateError.message);
        }
        return;
      }

      // Update last saved values
      if (fields.username !== undefined) lastSavedRef.current.username = fields.username;
      if (fields.displayName !== undefined) lastSavedRef.current.displayName = fields.displayName;
      if (fields.bio !== undefined) lastSavedRef.current.bio = fields.bio;

      // Trigger translation for bio if it changed
      if (fields.bio && fields.bio.trim() !== (profile.bio || "")) {
        triggerTranslation("profile", profile.id, [
          { field_name: "bio", text: fields.bio.trim() },
        ]);
      }

      setSaveStatus("saved");
      router.refresh();
    },
    [profile.id, profile.bio, router]
  );

  // Debounced username availability check
  useEffect(() => {
    if (!username || username === profile.username) {
      setUsernameAvailable(null);
      setUsernameError(null);
      return;
    }

    // Client-side validation first
    if (username.length < 3) {
      setUsernameError(t("usernameMinLength"));
      setUsernameAvailable(null);
      return;
    }
    if (username.length > 20) {
      setUsernameError(t("usernameMaxLength"));
      setUsernameAvailable(null);
      return;
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      setUsernameError(t("usernameFormat"));
      setUsernameAvailable(null);
      return;
    }

    setUsernameError(null);
    setUsernameChecking(true);

    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", profile.id)
        .maybeSingle();

      setUsernameChecking(false);
      setUsernameAvailable(!existing);
      if (existing) {
        setUsernameError(t("usernameTaken"));
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, profile.username, profile.id, t]);

  // Autosave username after validation passes
  useEffect(() => {
    if (usernameAvailable === true && username !== lastSavedRef.current.username) {
      saveProfile({ username });
    }
  }, [usernameAvailable, username, saveProfile]);

  // Autosave displayName and bio with debounce
  useEffect(() => {
    const hasDisplayNameChange = displayName !== lastSavedRef.current.displayName;
    const hasBioChange = bio !== lastSavedRef.current.bio;

    if (!hasDisplayNameChange && !hasBioChange) return;

    const timer = setTimeout(() => {
      saveProfile({ displayName, bio });
    }, 1000);

    return () => clearTimeout(timer);
  }, [displayName, bio, saveProfile]);

  // Auto-hide "Saved" status after 2 seconds
  useEffect(() => {
    if (saveStatus === "saved") {
      const timer = setTimeout(() => setSaveStatus("idle"), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(value);
  };

  const handleBioChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= BIO_MAX_LENGTH) {
      setBio(value);
    }
  };

  const handleAvatarChange = useCallback(
    async (url: string | null) => {
      setAvatarUrl(url);

      // Auto-save avatar immediately
      if (url !== profile.avatar_url) {
        setSaveStatus("saving");
        const supabase = createClient();
        const { error: saveError } = await supabase
          .from("profiles")
          .update({ avatar_url: url })
          .eq("id", profile.id);

        if (saveError) {
          setSaveStatus("error");
          setError(saveError.message);
        } else {
          setSaveStatus("saved");
          router.refresh();
        }
      }
    },
    [profile.id, profile.avatar_url, router]
  );

  return (
    <div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("editProfile")}</CardTitle>
          {/* Save status indicator */}
          <div className="h-6 flex items-center">
            {saveStatus === "saving" && (
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("saving")}
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-sm text-green-600 flex items-center gap-1.5">
                <Check className="w-3 h-3" />
                {t("saved")}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Avatar */}
          <div className="space-y-3">
            <Label>{t("profilePhoto")}</Label>
            <AvatarUpload
              userId={profile.id}
              currentAvatarUrl={avatarUrl}
              onAvatarChange={handleAvatarChange}
              size="lg"
              aiAvatarButton={
                <AIAvatarDialog
                  profileId={profile.id}
                  displayName={displayName}
                  onAvatarGenerated={(url) => handleAvatarChange(url)}
                />
              }
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">{t("username")}</Label>
            <div className="relative">
              <div className="flex items-center">
                <span className="text-muted-foreground mr-1">@</span>
                <Input
                  id="username"
                  name="username"
                  value={username}
                  onChange={handleUsernameChange}
                  placeholder={t("usernamePlaceholder")}
                  className={cn(
                    "pr-10",
                    usernameError && "border-destructive focus-visible:ring-destructive"
                  )}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameChecking && (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                  {!usernameChecking &&
                    usernameAvailable === true &&
                    username !== profile.username && (
                      <Check className="w-4 h-4 text-green-500" />
                    )}
                  {!usernameChecking && usernameError && (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  )}
                </div>
              </div>
            </div>
            {usernameError && (
              <p className="text-sm text-destructive">{usernameError}</p>
            )}
            {!usernameError &&
              usernameAvailable === true &&
              username !== profile.username && (
                <p className="text-sm text-green-600">{t("usernameAvailable")}</p>
              )}
            <p className="text-xs text-muted-foreground">{t("usernameHelp")}</p>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="display_name">{t("displayName")}</Label>
            <Input
              id="display_name"
              name="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("displayNamePlaceholder")}
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">{t("displayNameHelp")}</p>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="bio">{t("bio")}</Label>
              <span
                className={cn(
                  "text-xs",
                  bio.length >= BIO_MAX_LENGTH
                    ? "text-destructive"
                    : bio.length >= BIO_MAX_LENGTH - 20
                      ? "text-amber-500"
                      : "text-muted-foreground"
                )}
              >
                {bio.length}/{BIO_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id="bio"
              name="bio"
              value={bio}
              onChange={handleBioChange}
              placeholder={t("bioPlaceholder")}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground">{t("bioHelp")}</p>
          </div>

          {/* Error message */}
          {saveStatus === "error" && error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
