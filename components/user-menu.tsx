"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LogOut, Moon, Sun, Laptop, User, Globe, Settings, ExternalLink, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALE_NAMES, LOCALE_FLAGS, SUPPORTED_LOCALES } from "@/lib/locale";
import type { Locale } from "@/lib/types";

interface UserMenuProps {
  avatarUrl: string | null;
  displayName: string | null;
  username: string | null;
  userId: string;
  currentLocale: Locale;
}

export function UserMenu({ avatarUrl, displayName, username, userId, currentLocale }: UserMenuProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const t = useTranslations("userMenu");
  const tCommon = useTranslations("common");
  const [mounted, setMounted] = useState(false);
  const [locale, setLocale] = useState<Locale>(currentLocale);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const changeLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    const supabase = createClient();
    startTransition(async () => {
      await supabase
        .from("profiles")
        .update({ locale: newLocale })
        .eq("id", userId);
      router.refresh();
    });
  };

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;

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

        <DropdownMenuSeparator />

        {/* Theme submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {mounted && <ThemeIcon className="w-4 h-4 mr-2" />}
            Theme
            {mounted && (
              <span className="ml-auto text-xs text-muted-foreground capitalize">
                {theme}
              </span>
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme("light")} className="justify-between">
              <span className="flex items-center">
                <Sun className="w-4 h-4 mr-2" />
                Light
              </span>
              {mounted && theme === "light" && <Check className="w-4 h-4 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")} className="justify-between">
              <span className="flex items-center">
                <Moon className="w-4 h-4 mr-2" />
                Dark
              </span>
              {mounted && theme === "dark" && <Check className="w-4 h-4 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")} className="justify-between">
              <span className="flex items-center">
                <Laptop className="w-4 h-4 mr-2" />
                System
              </span>
              {mounted && theme === "system" && <Check className="w-4 h-4 text-primary" />}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Language submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={isPending}>
            <Globe className="w-4 h-4 mr-2" />
            Language
            <span className="ml-auto text-xs">
              {LOCALE_FLAGS[locale]}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {SUPPORTED_LOCALES.map((l) => (
              <DropdownMenuItem key={l} onClick={() => changeLocale(l)} className="justify-between">
                <span className="flex items-center gap-2">
                  <span>{LOCALE_FLAGS[l]}</span>
                  {LOCALE_NAMES[l]}
                </span>
                {l === locale && <Check className="w-4 h-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={logout} className="text-red-500 focus:text-red-500">
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
