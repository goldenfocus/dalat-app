"use client";

import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Premium verified badge with golden diamond and prominent glow aura.
 * Position this absolutely on the parent container (usually an avatar).
 *
 * IMPORTANT: The parent container needs overflow-visible for the glow to show!
 */
export function VerifiedBadge({ size = "md", className }: VerifiedBadgeProps) {
  // Badge sizes
  const badgeSizes = {
    sm: { badge: "w-6 h-6", icon: "w-3 h-3", glow: "w-14 h-14 -inset-4" },
    md: { badge: "w-8 h-8", icon: "w-4 h-4", glow: "w-20 h-20 -inset-6" },
    lg: { badge: "w-10 h-10", icon: "w-5 h-5", glow: "w-24 h-24 -inset-7" },
  };

  const { badge, icon, glow } = badgeSizes[size];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        badge,
        className
      )}
      style={{ overflow: "visible" }}
    >
      {/* Outer glow aura - extends beyond badge */}
      <div
        className={cn(
          "absolute rounded-full pointer-events-none",
          glow
        )}
        style={{
          background: "radial-gradient(circle, rgba(251,191,36,0.7) 0%, rgba(251,191,36,0.4) 30%, rgba(251,191,36,0.1) 60%, transparent 70%)",
        }}
      />

      {/* Secondary glow layer for intensity */}
      <div
        className={cn(
          "absolute rounded-full pointer-events-none",
          glow
        )}
        style={{
          background: "radial-gradient(circle, rgba(245,158,11,0.5) 0%, rgba(245,158,11,0.2) 40%, transparent 60%)",
          filter: "blur(4px)",
        }}
      />

      {/* Badge border/ring with golden gradient */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "linear-gradient(135deg, #fcd34d 0%, #f59e0b 50%, #d97706 100%)",
          boxShadow: "0 0 12px 4px rgba(251,191,36,0.6), 0 0 24px 8px rgba(251,191,36,0.3)",
        }}
      />

      {/* Inner fill */}
      <div
        className="absolute inset-[2px] rounded-full"
        style={{
          background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)",
        }}
      />

      {/* Diamond icon */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn("relative z-10", icon)}
      >
        {/* Diamond shape */}
        <path
          d="M12 2L2 9L12 22L22 9L12 2Z"
          fill="white"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Facet details */}
        <path
          d="M2 9H22M12 2L8 9L12 22L16 9L12 2Z"
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="0.75"
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
        "inline-flex items-center justify-center w-6 h-6 rounded-full",
        className
      )}
      style={{
        background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)",
        boxShadow: "0 0 8px 2px rgba(251,191,36,0.5)",
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
        <path
          d="M12 2L2 9L12 22L22 9L12 2Z"
          fill="white"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M2 9H22M12 2L8 9L12 22L16 9L12 2Z"
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
