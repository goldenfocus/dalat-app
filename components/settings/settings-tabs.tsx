"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { User, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsTabs() {
  const pathname = usePathname();
  const t = useTranslations("profile");
  const tSettings = useTranslations("settings");

  const tabs = [
    {
      href: "/settings/profile",
      label: t("editProfile"),
      icon: User,
      active: pathname === "/settings/profile",
    },
    {
      href: "/settings",
      label: tSettings("settings"),
      icon: Settings,
      active: pathname === "/settings",
    },
  ];

  return (
    <div className="flex gap-1 p-1 bg-muted rounded-lg">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all",
            tab.active
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <tab.icon className="w-4 h-4" />
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
