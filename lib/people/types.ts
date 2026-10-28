import type { ContentLocale } from "@/lib/types";

export interface PeopleProfile {
  user_id: string;
  enabled: boolean;
  intentions: string[];
  interests: string[];
  languages: string[];
  help_offered: string;
  help_wanted: string;
  source_locale: ContentLocale | null;
  created_at: string;
  updated_at: string;
  content_updated_at: string;
}

export interface PeopleIdentity {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export interface PeopleCard extends PeopleProfile {
  original_help_offered?: string;
  original_help_wanted?: string;
  original_bio?: string | null;
  profile: PeopleIdentity;
}

export interface PeopleFilters {
  q?: string;
  intention?: string;
  language?: string;
  page?: number;
  eventId?: string;
}

export interface PeopleBlock {
  blocked_id: string;
  profile: Pick<
    PeopleIdentity,
    "id" | "display_name" | "username" | "avatar_url"
  >;
}
