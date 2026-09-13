import { z } from "zod";
export const liveTurnSchema = z.object({
  id: z.string().min(1).max(150),
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(12000),
  at: z.iso.datetime(),
});
export const liveConversationSchema = z.array(liveTurnSchema).max(200);
export type LiveTurn = z.infer<typeof liveTurnSchema>;
export function liveEvidence(turns: LiveTurn[]) {
  return turns
    .filter((t) => t.role === "user")
    .map((t) => t.text)
    .join("\n\n");
}
