import { z } from "zod";

const count = z.number().int().nonnegative();

export const rentalStatsCounts = z.object({
  views: count,
  mediaClicks: count,
  requests: count,
  watching: count,
});

export const ownedRentalStats = z.array(z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(["draft", "published"]),
  counts: rentalStatsCounts,
  media: z.array(z.object({ src: z.string(), clicks: count })),
}));

export type RentalStatsCounts = z.infer<typeof rentalStatsCounts>;

export const rentalStatLabels = {
  views: "statsViews",
  mediaClicks: "statsMediaClicks",
  requests: "statsRequests",
  watching: "statsWatching",
} as const;
