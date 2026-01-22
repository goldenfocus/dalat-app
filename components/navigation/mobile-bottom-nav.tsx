"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Calendar, MapPin, Plus, User, Video, Sparkles } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { triggerHaptic } from "@/lib/haptics";
import { GoLiveModal } from "@/components/streaming/GoLiveModal";

const NAV_ITEMS = [
  {
    key: "map",
    href: "/map",
    icon: MapPin,
    labelKey: "map",
    requiresAuth: false,
  },
  {
    key: "calendar",
    href: "/calendar",
    icon: Calendar,
    labelKey: "calendar",
    requiresAuth: false,
  },
  {
    key: "moments",
    href: "/moments",
    icon: Sparkles,
    labelKey: "moments",
    requiresAuth: false,
  },
  {
    key: "live",
    href: null, // Special case: opens modal
    icon: Video,
    labelKey: "goLive",
    requiresAuth: true,
  },
  {
    key: "create",
    href: "/events/new",
    icon: Plus,
    labelKey: "create",
    requiresAuth: true,
  },
  {
    key: "profile",
    href: "/settings/profile",
    icon: User,
    labelKey: "profile",
    requiresAuth: true,
  },
];

interface MobileBottomNavProps {
  isAuthenticated?: boolean;
}

function normalizePath(pathname: string) {
  return pathname.replace(/^\/[a-z]{2}(\/|$)/, "/") || "/";
}

export function MobileBottomNav({ isAuthenticated = false }: MobileBottomNavProps) {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tStreaming = useTranslations("streaming");
  const normalizedPath = normalizePath(pathname);

  // Hide nav on immersive moments feed for TikTok-style experience
  if (normalizedPath === "/moments") {
    return null;
  }

  // Filter items based on auth status
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.requiresAuth || isAuthenticated
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex h-16 max-w-md items-center justify-around px-4">
        {visibleItems.map((item) => {
          const Icon = item.icon;

          // Special case: Go Live button opens modal
          if (item.key === "live") {
            return (
              <GoLiveModal
                key={item.key}
                trigger={
                  <button
                    aria-label={tStreaming("goLive")}
                    className="flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 text-muted-foreground hover:text-foreground"
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                }
              />
            );
          }

          // Profile is active for any /settings path
          const isActive = item.key === "profile"
            ? normalizedPath.startsWith("/settings")
            : item.href && normalizedPath.startsWith(item.href);
          const label = item.labelKey === "create"
            ? tCommon("create")
            : tNav(item.labelKey);

          return (
            <Link
              key={item.key}
              href={item.href!}
              prefetch={false}
              onClick={() => triggerHaptic("selection")}
              aria-label={label}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
