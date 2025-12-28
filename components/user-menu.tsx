"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { LogOut, Moon, Sun, Laptop, User, Globe, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
      <DropdownMenuTrigger className="focus:outline-none">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-8 h-8 rounded-full ring-2 ring-transparent hover:ring-muted transition-all"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
            <User className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium truncate">{displayName || username || "User"}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Profile settings */}
        <DropdownMenuItem asChild>
          <Link href="/settings/profile" className="cursor-pointer">
            <Settings className="w-4 h-4 mr-2" />
            Edit profile
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Theme submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {mounted && <ThemeIcon className="w-4 h-4 mr-2" />}
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="w-4 h-4 mr-2" />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="w-4 h-4 mr-2" />
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Laptop className="w-4 h-4 mr-2" />
              System
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Language submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={isPending}>
            <Globe className="w-4 h-4 mr-2" />
            {LOCALE_FLAGS[locale]} {LOCALE_NAMES[locale]}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {SUPPORTED_LOCALES.map((l) => (
              <DropdownMenuItem key={l} onClick={() => changeLocale(l)}>
                <span className="mr-2">{LOCALE_FLAGS[l]}</span>
                {LOCALE_NAMES[l]}
                {l === locale && <span className="ml-auto">✓</span>}
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
