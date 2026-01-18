"use client";

import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { User, Settings, ExternalLink, Shield, Building2, LogOut, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserRole } from "@/lib/types";

interface UserMenuProps {
  avatarUrl: string | null;
  displayName: string | null;
  username: string | null;
  role: UserRole;
  isGodMode?: boolean;
}

// Roles that can access /admin panel (organizers use /organizer portal instead)
const ADMIN_ROLES: UserRole[] = ["superadmin", "admin", "moderator", "contributor"];

export function UserMenu({ avatarUrl, displayName, username, role, isGodMode = false }: UserMenuProps) {
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);

  // Hide admin access when in God Mode (full immersion)
  const hasAdminAccess = !isGodMode && ADMIN_ROLES.includes(role);
  const isOrganizer = !isGodMode && role === "organizer_verified";
  const t = useTranslations("userMenu");
  const tCommon = useTranslations("common");

  const handleExitGodMode = async () => {
    setIsExiting(true);
    try {
      await fetch("/api/admin/exit-impersonation", { method: "POST" });
      router.push("/admin/users");
      router.refresh();
    } catch (error) {
      console.error("Failed to exit God Mode:", error);
      setIsExiting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus:outline-none group">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-9 h-9 rounded-full ring-2 ring-border/50 group-hover:ring-primary/50 group-hover:scale-105 transition-all duration-200 ease-out"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center ring-2 ring-border/50 group-hover:ring-primary/50 group-hover:scale-105 transition-all duration-200 ease-out">
            <User className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {/* Profile header with avatar */}
        <div className="px-2 py-3">
          <Link
            href={username ? `/@${username}` : "/settings/profile"}
            className="flex items-center gap-3 group/profile"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="w-10 h-10 rounded-full ring-2 ring-border/50"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center ring-2 ring-border/50">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate group-hover/profile:text-primary transition-colors">
                {displayName || username || tCommon("user")}
              </p>
              {username && (
                <p className="text-sm text-muted-foreground truncate">@{username}</p>
              )}
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover/profile:opacity-100 transition-opacity" />
          </Link>
        </div>
        <DropdownMenuSeparator />

        {/* Profile settings */}
        <DropdownMenuItem asChild>
          <Link href="/settings/profile" className="cursor-pointer">
            <User className="w-4 h-4 mr-2" />
            {t("editProfile")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="w-4 h-4 mr-2" />
            {t("settings")}
          </Link>
        </DropdownMenuItem>

        {hasAdminAccess && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin" className="cursor-pointer">
                <Shield className="w-4 h-4 mr-2" />
                {t("admin")}
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {isOrganizer && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/organizer" className="cursor-pointer">
                <Building2 className="w-4 h-4 mr-2" />
                {t("organizerPortal")}
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {isGodMode && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleExitGodMode}
              disabled={isExiting}
              className="cursor-pointer text-amber-600 focus:text-amber-600 focus:bg-amber-50 dark:focus:bg-amber-950"
            >
              {isExiting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4 mr-2" />
              )}
              {t("exitGodMode")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
