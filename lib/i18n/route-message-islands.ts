import { routing, type Locale } from "@/lib/i18n/routing";
import { CLIENT_NAMESPACES, CORE_CLIENT_NAMESPACES } from "./client-namespaces";

/**
 * Route-level message islands.
 *
 * Homepage + core shell ship CORE_CLIENT_NAMESPACES in the RSC payload.
 * Everything else loads only the namespaces it needs — never the full idle
 * dictionary dump on every page.
 *
 * Unmatched deep routes fall back to all remaining CLIENT_NAMESPACES (safe).
 */

export type RouteIsland = {
  /** Path without locale prefix, e.g. "/map", "/events/new" */
  test: (path: string) => boolean;
  namespaces: readonly string[];
};

const CORE_SET = new Set<string>(CORE_CLIENT_NAMESPACES);

/** Strip locale prefix from pathname → app path starting with / */
export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length > 0 &&
    routing.locales.includes(segments[0] as Locale)
  ) {
    const rest = segments.slice(1).join("/");
    return rest ? `/${rest}` : "/";
  }
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

/**
 * Paths that only need the core shell (homepage, static marketing-ish lists).
 * No extra message load — saves the ~50KB+ idle JSON fetch on the hot path.
 */
function isCoreOnlyPath(path: string): boolean {
  if (path === "/" || path === "") return true;
  // Event discovery lists — server-rendered, core events/home keys only
  if (
    path === "/events/upcoming" ||
    path === "/events/this-week" ||
    path === "/events/this-month" ||
    path.startsWith("/events/archive") ||
    path.startsWith("/events/tags/") ||
    path === "/pickleball"
  ) {
    return true;
  }
  return false;
}

export const ROUTE_MESSAGE_ISLANDS: RouteIsland[] = [
  {
    test: (p) => p === "/map" || p.startsWith("/map/"),
    namespaces: ["mapPage", "venues", "categories", "eventTags"],
  },
  {
    test: (p) => p.startsWith("/venues"),
    namespaces: ["venues", "mapPage", "categories"],
  },
  {
    test: (p) => p.startsWith("/loyalty"),
    namespaces: ["loyalty"],
  },
  {
    test: (p) =>
      p === "/events/new" ||
      /\/events\/[^/]+\/edit$/.test(p) ||
      p.startsWith("/events/new/"),
    namespaces: [
      "eventForm",
      "flyerBuilder",
      "eventTags",
      "eventSettings",
      "recurrence",
      "categories",
      "venues",
      "promo",
      "questionnaireBuilder",
      "series",
    ],
  },
  {
    // Single event detail (not list/new/edit)
    test: (p) =>
      /^\/events\/[^/]+$/.test(p) &&
      !["upcoming", "this-week", "this-month", "new", "archive", "tags"].includes(
        p.split("/")[2] ?? ""
      ),
    namespaces: [
      "invite",
      "rsvpCelebration",
      "comments",
      "checkin",
      "plusOnes",
      "attendees",
      "eventActions",
      "feedback",
      "promo",
      "reconfirmation",
      "celebration",
      "questionnaire",
      "eventSettings",
      "streaming",
    ],
  },
  {
    test: (p) => p.startsWith("/calendar"),
    namespaces: ["calendar", "calendarView", "eventTags", "categories"],
  },
  {
    test: (p) => p.startsWith("/settings") || p.startsWith("/protected"),
    namespaces: ["settings", "profile", "onboarding"],
  },
  {
    test: (p) => p.startsWith("/tribes") || p.startsWith("/contacts"),
    namespaces: ["tribes", "contacts"],
  },
  {
    test: (p) => p.startsWith("/profile") || p.startsWith("/settings/profile"),
    namespaces: ["profile", "loyalty"],
  },
  {
    test: (p) => p.startsWith("/news"),
    namespaces: ["news"],
  },
  {
    test: (p) => p.startsWith("/feed"),
    namespaces: ["feed", "comments"],
  },
  {
    test: (p) => p.startsWith("/moments"),
    namespaces: ["moments", "playlist"],
  },
  {
    test: (p) => p.startsWith("/organizer") || p.startsWith("/admin"),
    namespaces: [
      "organizer",
      "eventForm",
      "eventSettings",
      "responseDashboard",
      "festival",
      "series",
      "activity",
    ],
  },
  {
    test: (p) => p.startsWith("/onboarding"),
    namespaces: ["onboarding"],
  },
  {
    test: (p) => p.startsWith("/login") || p.startsWith("/auth") || p.startsWith("/sign"),
    namespaces: ["auth"],
  },
];

/**
 * Namespaces to merge for a given app pathname (no locale prefix).
 * Returns empty array for core-only paths (no extra fetch).
 * Returns extra namespaces beyond CORE for island routes.
 * Returns all non-core CLIENT_NAMESPACES for unknown deep routes.
 */
export function extraNamespacesForPath(pathname: string): string[] {
  const path = stripLocalePrefix(pathname);

  if (isCoreOnlyPath(path)) {
    return [];
  }

  for (const island of ROUTE_MESSAGE_ISLANDS) {
    if (island.test(path)) {
      // Only namespaces not already in core
      return island.namespaces.filter((ns) => !CORE_SET.has(ns));
    }
  }

  // Safe fallback: everything client components might need
  return CLIENT_NAMESPACES.filter((ns) => !CORE_SET.has(ns));
}
