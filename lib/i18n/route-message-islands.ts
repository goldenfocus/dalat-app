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

/**
 * Segment-anchored section match: /section or /section/... — never a vanity
 * /[slug] that merely starts with the same letters (e.g. /signature-lounge
 * must NOT match "sign", /organizers must NOT match "organizer").
 */
const inSection = (p: string, ...sections: string[]) =>
  sections.some((s) => p === `/${s}` || p.startsWith(`/${s}/`));

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
  // Event discovery lists — server-rendered, core events/home keys only.
  // NOTE: /events/archive is NOT core-only — its filter bar needs "archive"
  // (island below); core-only paths never merge extra namespaces.
  if (
    path === "/events/upcoming" ||
    path === "/events/this-week" ||
    path === "/events/this-month" ||
    path.startsWith("/events/tags/") ||
    path === "/pickleball"
  ) {
    return true;
  }
  return false;
}

export const ROUTE_MESSAGE_ISLANDS: RouteIsland[] = [
  {
    test: (p) => inSection(p, "map"),
    namespaces: ["mapPage", "venues", "categories", "eventTags"],
  },
  {
    test: (p) => inSection(p, "venues"),
    namespaces: ["venues", "mapPage", "categories"],
  },
  {
    test: (p) => inSection(p, "loyalty"),
    namespaces: ["loyalty"],
  },
  {
    // Archive filter/sort bar (archive-events-list, archive-filters)
    test: (p) => p.startsWith("/events/archive"),
    namespaces: ["archive"],
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
      // PostCreationCelebration dialog after create/edit
      "celebration",
      "invite",
    ],
  },
  {
    test: (p) => /^\/events\/[^/]+\/table$/.test(p),
    namespaces: ["pokerTable"],
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
      "calendar",
      "eventActions",
      "eventTags",
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
    test: (p) => inSection(p, "calendar"),
    namespaces: ["calendar", "calendarView", "eventTags", "categories"],
  },
  {
    test: (p) => inSection(p, "settings", "protected"),
    namespaces: ["settings", "profile", "onboarding"],
  },
  {
    test: (p) => inSection(p, "tribes", "contacts"),
    // "contacts" dropped: its only two consumers (components/tribe/contact-*)
    // were deleted with the orphaned contacts stack, and no /contacts route
    // exists. "invite" added: TribeInviteModal embeds the SHARED
    // components/shared/invitee-input.tsx, which calls
    // useTranslations("invite"). Without it registered here the chip input
    // renders raw keys — and only once the modal is opened, which no prebuild
    // guard can catch.
    namespaces: ["tribes", "invite"],
  },
  {
    test: (p) => inSection(p, "profile"),
    namespaces: ["profile", "loyalty"],
  },
  {
    test: (p) => inSection(p, "news"),
    namespaces: ["news"],
  },
  {
    test: (p) => inSection(p, "feed"),
    namespaces: ["feed", "comments"],
  },
  {
    test: (p) => inSection(p, "moments"),
    // comments: CommentsButton via moment-engagement-bar
    namespaces: ["moments", "playlist", "comments"],
  },
  {
    test: (p) => inSection(p, "organizer", "admin"),
    namespaces: [
      "organizer",
      "eventForm",
      "eventSettings",
      "responseDashboard",
      "festival",
      "series",
      "activity",
      // event-media-upload.tsx (admin homepage/venue forms) uses flyerBuilder keys
      "flyerBuilder",
    ],
  },
  {
    // ProfileStep/AvatarStep/LanguageStep also use profile + settings keys
    test: (p) => inSection(p, "onboarding"),
    namespaces: ["onboarding", "profile", "settings"],
  },
  {
    test: (p) => inSection(p, "auth", "login", "sign-in", "sign-up", "signup"),
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
