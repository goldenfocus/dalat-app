"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import {
  ChevronLeft,
  ChevronRight,
  Shield,
  Building2,
  PartyPopper,
  ShieldCheck,
  Users,
  Download,
  LayoutDashboard,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

// Icon name to component mapping
const ICON_MAP: Record<string, LucideIcon> = {
  Shield,
  Building2,
  PartyPopper,
  ShieldCheck,
  Users,
  Download,
  LayoutDashboard,
  FileText,
};

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface AdminSidebarProps {
  navItems: NavItem[];
  role: UserRole;
  roleLabel: string;
}

const SIDEBAR_COLLAPSED_KEY = "admin-sidebar-collapsed";

export function AdminSidebar({ navItems, role, roleLabel }: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) {
      setCollapsed(stored === "true");
    }
    setMounted(true);
  }, []);

  // Persist collapsed state
  const toggleCollapsed = () => {
    const newValue = !collapsed;
    setCollapsed(newValue);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newValue));
  };

  // Normalize pathname for matching (remove locale prefix)
  const normalizedPath = pathname.replace(/^\/[a-z]{2}(\/|$)/, "/") || "/";

  const isActive = (href: string) => {
    if (href === "/admin") {
      return normalizedPath === "/admin";
    }
    return normalizedPath.startsWith(href);
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <aside className="w-64 border-r border-border/40 bg-background/50 flex flex-col shrink-0 sticky top-14 h-[calc(100vh-3.5rem)]" />
    );
  }

  return (
    <aside
      className={cn(
        "border-r border-border/40 bg-background/50 flex flex-col transition-all duration-300 ease-in-out shrink-0 sticky top-14 h-[calc(100vh-3.5rem)]",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header with role badge */}
      <div
        className={cn(
          "p-4 border-b border-border/40 relative",
          collapsed && "px-2 py-4"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg bg-primary/10 text-primary font-medium",
            collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
          )}
        >
          <Shield className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="text-sm truncate">{roleLabel}</span>}
        </div>

        {/* Collapse toggle button */}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const Icon = ICON_MAP[item.icon] || Shield;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg transition-all duration-200",
                collapsed ? "justify-center px-2 py-3" : "px-3 py-2.5",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
