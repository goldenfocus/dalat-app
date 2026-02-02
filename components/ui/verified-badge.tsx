"use client";

import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Premium verified badge with golden diamond and glow effect.
 * Position this absolutely on the parent container (usually an avatar).
 */
export function VerifiedBadge({ size = "md", className }: VerifiedBadgeProps) {
  const sizeClasses = {
    sm: "w-5 h-5",
    md: "w-7 h-7",
    lg: "w-9 h-9",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full",
        sizeClasses[size],
        className
      )}
    >
      {/* Outer glow */}
      <div className="absolute inset-0 rounded-full bg-amber-400/60 blur-md animate-pulse" />

      {/* Golden ring */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 shadow-lg shadow-amber-500/50" />

      {/* Inner background */}
      <div className="absolute inset-[2px] rounded-full bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600" />

      {/* Diamond icon */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn("relative z-10", iconSizes[size])}
      >
        {/* Diamond shape with white fill and subtle shadow */}
        <path
          d="M12 2L2 9L12 22L22 9L12 2Z"
          fill="white"
          stroke="white"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* Facet lines for diamond detail */}
        <path
          d="M2 9H22M12 2L8 9L12 22L16 9L12 2Z"
          fill="none"
          stroke="rgba(0,0,0,0.1)"
          strokeWidth="0.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Inline verified badge for use next to text (like in titles).
 * Simpler design without the avatar positioning.
 */
export function VerifiedBadgeInline({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-500 shadow-md shadow-amber-500/30",
        className
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
        <path
          d="M12 2L2 9L12 22L22 9L12 2Z"
          fill="white"
          stroke="white"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M2 9H22M12 2L8 9L12 22L16 9L12 2Z"
          fill="none"
          stroke="rgba(0,0,0,0.1)"
          strokeWidth="0.5"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
