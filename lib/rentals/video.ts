import { z } from "zod";

export const rentalVideoId = z.string().regex(/^[a-f0-9]{32}$/);
export const rentalVideoMaxBytes = 500 * 1024 * 1024;
