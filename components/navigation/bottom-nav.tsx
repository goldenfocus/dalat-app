"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Users, Book, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTTOM_NAV_ITEMS } from "@/lib/navigation";

const ICON_MAP = {
    Home,
    Calendar,
    Users,
    Book,
    User,
};

export function BottomNav() {
    const pathname = usePathname();

    // Remove locale prefix for comparison
    const currentPath = pathname?.replace(/^\/[a-z]{2}/, "") || "/";

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border pb-safe">
            <div className="grid grid-cols-5 h-16">
                {BOTTOM_NAV_ITEMS.map((item) => {
                    const isActive =
                        currentPath === item.href ||
                        (item.href !== "/" && currentPath.startsWith(item.href));
                    const Icon = ICON_MAP[item.icon as keyof typeof ICON_MAP];

                    return (
                        <Link
                            key={item.href + item.label}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1 transition-colors",
                                isActive
                                    ? "text-green-600"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
