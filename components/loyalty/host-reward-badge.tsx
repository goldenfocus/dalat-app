import { cn } from "@/lib/utils";
import {
  Star,
  BarChart3,
  Sparkles,
  Headphones,
  Palette,
  type LucideIcon,
} from "lucide-react";

type HostRewardType =
  | "premium_listing"
  | "analytics_access"
  | "featured_placement"
  | "priority_support"
  | "custom_branding";

const HOST_REWARD_CONFIG: Record<
  HostRewardType,
  { label: string; Icon: LucideIcon; color: string; bg: string; border: string }
> = {
  premium_listing: {
    label: "Premium Listing",
    Icon: Star,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  analytics_access: {
    label: "Analytics Access",
    Icon: BarChart3,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  featured_placement: {
    label: "Featured Placement",
    Icon: Sparkles,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
  priority_support: {
    label: "Priority Support",
    Icon: Headphones,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  custom_branding: {
    label: "Custom Branding",
    Icon: Palette,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
  },
};

interface HostRewardBadgeProps {
  rewardType: HostRewardType;
  isActive?: boolean;
  className?: string;
}

export function HostRewardBadge({
  rewardType,
  isActive = true,
  className,
}: HostRewardBadgeProps) {
  const config = HOST_REWARD_CONFIG[rewardType];
  const { Icon } = config;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        isActive
          ? cn(config.color, config.bg, config.border)
          : "border-muted bg-muted/50 text-muted-foreground grayscale",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{config.label}</span>
    </span>
  );
}
