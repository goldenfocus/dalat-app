import { cn } from "@/lib/utils";
import { Radio } from "lucide-react";

interface EventLifecycleBadgeProps {
  lifecycle: "happening" | "past";
  variant?: "default" | "floating";
  label?: string;
  className?: string;
}

export function EventLifecycleBadge({
  lifecycle,
  variant = "default",
  label,
  className,
}: EventLifecycleBadgeProps) {
  if (lifecycle === "happening") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium",
          variant === "floating"
            ? "bg-red-500/90 text-white backdrop-blur-sm"
            : "bg-red-500/10 text-red-600 dark:text-red-400",
          className
        )}
      >
        <Radio className="w-3 h-3 animate-pulse" />
        {label ?? "Live"}
      </span>
    );
  }

  if (lifecycle === "past") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium",
          variant === "floating"
            ? "bg-black/50 text-white/80 backdrop-blur-sm"
            : "bg-muted text-muted-foreground",
          className
        )}
      >
        {label ?? "Ended"}
      </span>
    );
  }

  return null;
}
