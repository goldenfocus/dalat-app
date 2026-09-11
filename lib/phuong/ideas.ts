import { z } from "zod";
export const ideaIds = [
  "drink",
  "photos",
  "meet",
  "bites",
  "bingo",
  "photo-challenge",
  "language",
  "local-tips",
  "teams",
  "music",
  "name-tags",
  "postcards",
  "birthday",
  "body-art",
] as const;
export const voteSchema = z
  .object({ ideaId: z.enum(ideaIds), rating: z.enum(["up", "down", "unsure"]) })
  .strict();
export type IdeaVote = {
  user_id: string;
  idea_id: string;
  rating: "up" | "down" | "unsure";
};
