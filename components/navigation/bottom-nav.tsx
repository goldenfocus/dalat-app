"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Briefcase, Grid, User, Book, Users, MapPin, Plus, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTTOM_NAV_ITEMS } from "@/lib/navigation";

const Icons = {
    Home,
    Calendar,
    Briefcase,
    Grid,
    User,
    Book,
    Users,
    MapPin,
    Plus,
    Compass,
} as const;

export function BottomNav() {
    const pathname = usePathname();

    // Remove locale prefix for comparison
    const currentPath = pathname?.replace(/^\/[a-z]{2}/, "") || "/";

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200 pb-safe">
            <div className="flex items-center justify-around h-16 max-w-md mx-auto px-4">
                {BOTTOM_NAV_ITEMS.map((item) => {
                    const isActive =
                        currentPath === item.href ||
                        (item.href !== "/" && currentPath.startsWith(item.href));
                    const Icon = Icons[item.icon];
                    const isAddButton = item.label === "Add";

                    if (isAddButton) {
                        return (
                            <Link
                                key={item.href + item.label}
                                href={item.href}
                                className="flex items-center justify-center w-12 h-12 bg-green-600 rounded-full shadow-lg hover:bg-green-700 active:scale-95 transition-all -mt-4"
                            >
                                <Icon className="w-6 h-6 text-white" />
                            </Link>
                        );
                    }

                    return (
                        <Link
                            key={item.href + item.label}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-lg transition-all active:scale-95",
                                isActive
                                    ? "text-green-600"
                                    : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5px]")} />
                            <span className={cn(
                                "text-[10px]",
                                isActive ? "font-semibold" : "font-medium"
                            )}>{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

// Desktop top navigation bar
export function TopNavBar() {
    const pathname = usePathname();
    const currentPath = pathname?.replace(/^\/[a-z]{2}/, "") || "/";

    return (
        <nav className="hidden lg:flex items-center gap-1 bg-gray-100 rounded-full p-1">
            {BOTTOM_NAV_ITEMS.filter(item => item.label !== "Add" && item.label !== "Me").map((item) => {
                const isActive =
                    currentPath === item.href ||
                    (item.href !== "/" && currentPath.startsWith(item.href));
                const Icon = Icons[item.icon];

                return (
                    <Link
                        key={item.href + item.label}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                            isActive
                                ? "bg-white text-green-600 shadow-sm"
                                : "text-gray-600 hover:text-gray-900 hover:bg-white/50"
                        )}
                    >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
