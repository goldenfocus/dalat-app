"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Settings, Lock, Globe, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TribeSettingsModal } from "./tribe-settings-modal";
import { TribeRequestsModal } from "./tribe-requests-modal";
import type { Tribe, TribeMember } from "@/lib/types";

interface TribeHeaderProps {
  tribe: Tribe & { profiles?: { display_name: string | null; avatar_url: string | null; username: string | null } };
  membership: TribeMember | null;
  isAdmin: boolean;
  /** Counts shown in the profile-style stat row. */
  eventCount: number;
  momentCount: number;
}

export function TribeHeader({ tribe, membership, isAdmin, eventCount, momentCount }: TribeHeaderProps) {
  const t = useTranslations("tribes");
  const [showSettings, setShowSettings] = useState(false);
  const [showRequests, setShowRequests] = useState(false);

  const accessIcon = {
    public: <Globe className="w-4 h-4" />,
    request: <Eye className="w-4 h-4" />,
    invite_only: <Lock className="w-4 h-4" />,
    secret: <EyeOff className="w-4 h-4" />,
  };

  // tribes.member_count is trigger-maintained and readable by everyone. The old
  // tribe_members(count) aggregate was filtered by RLS before aggregating, so
  // non-members always saw 0.
  const memberCount = (tribe as Tribe & { member_count?: number }).member_count ?? 0;

  return (
    <>
      <div className="relative">
        {/* Cover Image */}
        <div className="h-48 md:h-64 bg-gradient-to-br from-primary/20 to-primary/5 relative">
          {tribe.cover_image_url && (
            <Image
              src={tribe.cover_image_url}
              alt={tribe.name}
              fill
              className="object-cover"
              priority
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 -mt-16 relative">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            {/* Tribe avatar (letter fallback when none) */}
            <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-xl bg-primary/10 border-4 border-background flex items-center justify-center text-4xl font-bold text-primary overflow-hidden">
              {tribe.settings?.avatar_url ? (
                <Image
                  src={tribe.settings.avatar_url}
                  alt={tribe.name}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              ) : (
                tribe.name.charAt(0).toUpperCase()
              )}
            </div>

            <div className="flex-1 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold">{tribe.name}</h1>
                  {/* Profile-style stat row: members / events / moments */}
                  <div className="flex items-center gap-4 mt-2 text-muted-foreground">
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-semibold text-foreground">{memberCount}</span>
                      {t("members").toLowerCase()}
                    </span>
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-semibold text-foreground">{eventCount}</span>
                      {t("events").toLowerCase()}
                    </span>
                    {momentCount > 0 && (
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-semibold text-foreground">{momentCount}</span>
                        {t("moments").toLowerCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-muted-foreground">
                    <Badge variant="outline" className="gap-1">
                      {accessIcon[tribe.access_type]}
                      {t(tribe.access_type)}
                    </Badge>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex gap-2">
                    {tribe.access_type === "request" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowRequests(true)}
                        className="px-3 py-2"
                      >
                        {t("joinRequests")}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowSettings(true)}
                      className="p-2"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {tribe.description && (
                <p className="mt-3 text-muted-foreground">{tribe.description}</p>
              )}

              {tribe.profiles && (
                <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                  <Avatar className="w-5 h-5">
                    <AvatarImage src={tribe.profiles.avatar_url || undefined} />
                    <AvatarFallback>{tribe.profiles.display_name?.charAt(0) || "?"}</AvatarFallback>
                  </Avatar>
                  <span>{t("createdBy", { name: tribe.profiles.display_name || tribe.profiles.username || "Unknown" })}</span>
                </div>
              )}

              {membership && (
                <Badge variant="secondary" className="mt-3">
                  {t(membership.role)}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {isAdmin && (
        <>
          <TribeSettingsModal
            tribe={tribe}
            open={showSettings}
            onOpenChange={setShowSettings}
          />
          <TribeRequestsModal
            tribeSlug={tribe.slug}
            open={showRequests}
            onOpenChange={setShowRequests}
          />
        </>
      )}
    </>
  );
}
