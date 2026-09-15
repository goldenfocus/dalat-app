"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: ReactNode;
  className?: string;
  wrapTitle?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  className,
  wrapTitle = false,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-5 transition-colors hover:border-primary/30",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-sm text-muted-foreground", wrapTitle ? "leading-snug" : "truncate")}>{title}</p>
          <p className="text-2xl font-semibold tracking-tight mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className={cn("shrink-0 rounded-lg bg-muted p-2.5", wrapTitle && "hidden sm:block")}>
          {icon}
        </div>
      </div>
    </div>
  );
}
