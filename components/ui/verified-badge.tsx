"use client";

import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Simple diamond badge without glow - the glow goes on the avatar instead.
 */
export function VerifiedBadge({ size = "md", className }: VerifiedBadgeProps) {
  const badgeSizes = {
    sm: { badge: "w-6 h-6", icon: "w-3 h-3" },
    md: { badge: "w-8 h-8", icon: "w-4 h-4" },
    lg: { badge: "w-10 h-10", icon: "w-5 h-5" },
  };

  const { badge, icon } = badgeSizes[size];

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full",
        badge,
        className
      )}
      style={{
        background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)",
      }}
    >
      {/* Diamond icon */}
      <svg viewBox="0 0 24 24" fill="none" className={cn("relative z-10", icon)}>
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
    </div>
  );
}

/**
 * Golden glow ring to wrap around an avatar for verified users.
 * Use this as a wrapper around the avatar image.
 */
export function VerifiedGlowRing({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {/* Outer glow aura */}
      <div
        className="absolute -inset-3 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(251,191,36,0.6) 40%, rgba(251,191,36,0.3) 60%, rgba(251,191,36,0.1) 75%, transparent 85%)",
        }}
      />
      {/* Secondary glow for intensity */}
      <div
        className="absolute -inset-2 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(245,158,11,0.4) 50%, transparent 70%)",
          filter: "blur(8px)",
        }}
      />
      {/* Golden ring border */}
      <div
        className="absolute -inset-1 rounded-full pointer-events-none"
        style={{
          background: "linear-gradient(135deg, #fcd34d 0%, #f59e0b 50%, #d97706 100%)",
          boxShadow: "0 0 20px 6px rgba(251,191,36,0.5)",
        }}
      />
      {/* Content (avatar) with slight inset to show golden ring */}
      <div className="relative rounded-full overflow-hidden">
        {children}
      </div>
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
