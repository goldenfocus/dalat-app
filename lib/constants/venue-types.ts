import {
  Coffee,
  Wine,
  UtensilsCrossed,
  Palette,
  TreePine,
  Building2,
  Laptop,
  Users,
  Sun,
  Home,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import type { VenueType } from "@/lib/types";

export interface VenueTypeConfig {
  icon: LucideIcon;
  label: string;
  color: string;
  bgColor: string;
  darkColor: string;
  darkBgColor: string;
}

export const VENUE_TYPE_CONFIG: Record<VenueType, VenueTypeConfig> = {
  cafe: {
    icon: Coffee,
    label: "Cafe",
    color: "text-amber-600",
    bgColor: "bg-amber-100",
    darkColor: "dark:text-amber-400",
    darkBgColor: "dark:bg-amber-900/30",
  },
  bar: {
    icon: Wine,
    label: "Bar",
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    darkColor: "dark:text-purple-400",
    darkBgColor: "dark:bg-purple-900/30",
  },
  restaurant: {
    icon: UtensilsCrossed,
    label: "Restaurant",
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    darkColor: "dark:text-orange-400",
    darkBgColor: "dark:bg-orange-900/30",
  },
  gallery: {
    icon: Palette,
    label: "Gallery",
    color: "text-pink-600",
    bgColor: "bg-pink-100",
    darkColor: "dark:text-pink-400",
    darkBgColor: "dark:bg-pink-900/30",
  },
  park: {
    icon: TreePine,
    label: "Park",
    color: "text-green-600",
    bgColor: "bg-green-100",
    darkColor: "dark:text-green-400",
    darkBgColor: "dark:bg-green-900/30",
  },
  hotel: {
    icon: Building2,
    label: "Hotel",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    darkColor: "dark:text-blue-400",
    darkBgColor: "dark:bg-blue-900/30",
  },
  coworking: {
    icon: Laptop,
    label: "Coworking",
    color: "text-cyan-600",
    bgColor: "bg-cyan-100",
    darkColor: "dark:text-cyan-400",
    darkBgColor: "dark:bg-cyan-900/30",
  },
  community_center: {
    icon: Users,
    label: "Community Center",
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
    darkColor: "dark:text-indigo-400",
    darkBgColor: "dark:bg-indigo-900/30",
  },
  outdoor: {
    icon: Sun,
    label: "Outdoor",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    darkColor: "dark:text-yellow-400",
    darkBgColor: "dark:bg-yellow-900/30",
  },
  homestay: {
    icon: Home,
    label: "Homestay",
    color: "text-rose-600",
    bgColor: "bg-rose-100",
    darkColor: "dark:text-rose-400",
    darkBgColor: "dark:bg-rose-900/30",
  },
  other: {
    icon: MapPin,
    label: "Other",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    darkColor: "dark:text-gray-400",
    darkBgColor: "dark:bg-gray-800",
  },
};

export const VENUE_TYPES = Object.keys(VENUE_TYPE_CONFIG) as VenueType[];

// Map colors for venue markers on the map
export const VENUE_MARKER_COLORS = {
  default: {
    light: "#6b7280", // gray-500 - venue with no upcoming events
    dark: "#9ca3af",  // gray-400
  },
  active: {
    light: "#16a34a", // green-600 - venue has upcoming events
    dark: "#22c55e",  // green-500
  },
  happening: {
    light: "#dc2626", // red-600 - event happening now at venue
    dark: "#ef4444",  // red-500
  },
};

// Helper to get venue type config with fallback
export function getVenueTypeConfig(venueType: string | null): VenueTypeConfig {
  if (!venueType || !(venueType in VENUE_TYPE_CONFIG)) {
    return VENUE_TYPE_CONFIG.other;
  }
  return VENUE_TYPE_CONFIG[venueType as VenueType];
}
