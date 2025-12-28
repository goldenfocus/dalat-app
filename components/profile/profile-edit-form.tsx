"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarUpload } from "./avatar-upload";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

interface ProfileEditFormProps {
  profile: Profile;
}

const BIO_MAX_LENGTH = 160;

export function ProfileEditForm({ profile }: ProfileEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile.avatar_url
  );
  const [username, setUsername] = useState(profile.username || "");
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [bio, setBio] = useState(profile.bio || "");

  // Validation state
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null
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
      setUsernameError("Username must be at least 3 characters");
      setUsernameAvailable(null);
      return;
    }
    if (username.length > 20) {
      setUsernameError("Username must be 20 characters or less");
      setUsernameAvailable(null);
      return;
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      setUsernameError("Only lowercase letters, numbers, and underscores");
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
        setUsernameError("Username is already taken");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, profile.username, profile.id]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(value);
    setSuccess(false);
  };

  const handleBioChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= BIO_MAX_LENGTH) {
      setBio(value);
      setSuccess(false);
    }
  };

  const handleAvatarChange = useCallback((url: string | null) => {
    setAvatarUrl(url);
    setSuccess(false);
  }, []);

  const hasChanges =
    avatarUrl !== profile.avatar_url ||
    username !== (profile.username || "") ||
    displayName !== (profile.display_name || "") ||
    bio !== (profile.bio || "");

  const canSubmit =
    hasChanges &&
    !usernameChecking &&
    !usernameError &&
    (usernameAvailable !== false || username === profile.username);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!canSubmit) return;

    startTransition(async () => {
      const supabase = createClient();

      const updates: Partial<Profile> = {
        avatar_url: avatarUrl,
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
      };

      // Only update username if it changed
      if (username !== profile.username) {
        updates.username = username || null;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", profile.id);

      if (updateError) {
        if (updateError.message.includes("valid_username")) {
          setError("Invalid username format");
        } else if (updateError.message.includes("unique")) {
          setError("Username is already taken");
        } else {
          setError(updateError.message);
        }
        return;
      }

      setSuccess(true);
      router.refresh();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Avatar */}
          <div className="space-y-2">
            <Label>Profile photo</Label>
            <AvatarUpload
              userId={profile.id}
              currentAvatarUrl={avatarUrl}
              onAvatarChange={handleAvatarChange}
              size="lg"
            />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <div className="flex items-center">
                <span className="text-muted-foreground mr-1">@</span>
                <Input
                  id="username"
                  name="username"
                  value={username}
                  onChange={handleUsernameChange}
                  placeholder="yourname"
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
                <p className="text-sm text-green-600">Username is available!</p>
              )}
            <p className="text-xs text-muted-foreground">
              3-20 characters. Letters, numbers, and underscores only.
            </p>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              name="display_name"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setSuccess(false);
              }}
              placeholder="Your Name"
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">
              How your name appears on events and your profile
            </p>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="bio">Bio</Label>
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
              placeholder="Tell people a bit about yourself..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground">
              A short bio shown on your public profile
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <Check className="w-4 h-4" />
              Profile updated successfully!
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={isPending || !canSubmit}>
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>

            {hasChanges && !isPending && (
              <p className="text-sm text-muted-foreground">
                You have unsaved changes
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
