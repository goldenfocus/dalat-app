export type LiveGender = "woman" | "man" | "nonbinary";
export type ActivityAudience = "only_me" | "matches" | "members";
export interface LiveDatingProfile {
  user_id: string;
  enabled: boolean;
  birth_year: number;
  birth_date: string | null;
  gender: LiveGender;
  seeking: LiveGender[];
  min_age: number;
  max_age: number;
  interests: string[];
}
export interface DatingCard {
  id: string;
  name: string;
  avatar_url: string | null;
  birth_year: number;
  gender: LiveGender;
  interests: string[];
  liked: boolean;
  likes_you: boolean;
  matched: boolean;
}
export interface LiveDatingState {
  current_year?: number;
  profile: LiveDatingProfile | null;
  ready: boolean;
  cards: DatingCard[];
  audience: ActivityAudience;
  suspended: boolean;
}
export interface DatingMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}
export type DatingCopy = Record<string, string>;
