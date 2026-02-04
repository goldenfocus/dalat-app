"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Crown, Shield, User, Clock, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button as _Button } from "@/components/ui/button";
import type { TribeMember, TribeRequest, Tribe } from "@/lib/types";

interface MyTribesDropdownProps {
  locale: string;
}

type MemberWithTribe = TribeMember & { tribes: Tribe };
type RequestWithTribe = TribeRequest & { tribes: Tribe };

export function MyTribesDropdown({ locale }: MyTribesDropdownProps) {
  const t = useTranslations("tribes");
  const [tribes, setTribes] = useState<MemberWithTribe[]>([]);
  const [pendingRequests, setPendingRequests] = useState<RequestWithTribe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyTribes();
  }, []);

  async function fetchMyTribes() {
    setLoading(true);
    try {
      const res = await fetch("/api/tribes/me");
      if (res.ok) {
        const data = await res.json();
        setTribes(data.tribes || []);
        setPendingRequests(data.pending_requests || []);
      }
    } catch (error) {
      console.error("Failed to fetch tribes:", error);
    }
    setLoading(false);
  }

  const roleIcon = {
    leader: <Crown className="w-3 h-3 text-yellow-500" />,
    admin: <Shield className="w-3 h-3 text-blue-500" />,
    member: <User className="w-3 h-3 text-muted-foreground" />,
  };

  if (loading) {
    return (
      <div className="py-2 px-3">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="py-1">
      <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {t("myTribes")}
      </p>

      {tribes.length === 0 && pendingRequests.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">No tribes yet</p>
      ) : (
        <>
          {/* Active memberships */}
          {tribes.map((membership) => (
            <Link
              key={membership.id}
              href={`/${locale}/tribes/${membership.tribes.slug}`}
              className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-sm transition-colors"
            >
              <Avatar className="w-6 h-6">
                {membership.tribes.cover_image_url ? (
                  <AvatarImage src={membership.tribes.cover_image_url} />
                ) : null}
                <AvatarFallback className="text-xs">
                  {membership.tribes.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 text-sm truncate">{membership.tribes.name}</span>
              {roleIcon[membership.role]}
            </Link>
          ))}

          {/* Pending requests */}
          {pendingRequests.length > 0 && (
            <>
              <div className="border-t my-1" />
              <p className="px-3 py-1 text-xs font-medium text-muted-foreground">
                {t("pendingRequests")}
              </p>
              {pendingRequests.map((request) => (
                <Link
                  key={request.id}
                  href={`/${locale}/tribes/${request.tribes.slug}`}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-sm transition-colors opacity-60"
                >
                  <Avatar className="w-6 h-6">
                    {request.tribes.cover_image_url ? (
                      <AvatarImage src={request.tribes.cover_image_url} />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {request.tribes.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm truncate">{request.tribes.name}</span>
                  <Clock className="w-3 h-3 text-muted-foreground" />
                </Link>
              ))}
            </>
          )}
        </>
      )}

      <div className="border-t my-1" />
      <Link
        href={`/${locale}/tribes/new`}
        className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-sm transition-colors text-primary"
      >
        <Plus className="w-4 h-4" />
        <span className="text-sm">{t("createTribe")}</span>
      </Link>
    </div>
  );
}
