import { Activity, Building2, Calendar, MapPin, Newspaper, Trophy, Users } from "lucide-react";
import { isPeopleEnabled } from "@/lib/people/constants";

export const cityLinks = [
  { key: "map", href: "/map", icon: MapPin },
  { key: "calendar", href: "/calendar", icon: Calendar },
  { key: "venues", href: "/venues", icon: Building2 },
  { key: "news", href: "/news", icon: Newspaper },
  ...(isPeopleEnabled() ? [{ key: "people", href: "/people", icon: Users } as const] : []),
  { key: "activity", href: "/activity", icon: Activity },
  { key: "loyalty", href: "/loyalty", icon: Trophy },
] as const;

export function isSectionActive(pathname: string, section: string) {
  return pathname === section || pathname.startsWith(section + "/");
}
