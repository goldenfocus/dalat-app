import { describe, expect, it, vi } from "vitest";

const aiChatJson = vi.fn();
vi.mock("@/lib/ai/provider", () => ({ aiChatJson: (...args: unknown[]) => aiChatJson(...args) }));

import {
  TOKEN_INSTRUCTION,
  translateFieldsToLocale,
  translationTokensMismatch,
} from "./google-translate";

describe("translationTokensMismatch", () => {
  it("flags hallucinated and dropped tokens", () => {
    expect(translationTokensMismatch("Giang Metta Studio", "⟦0⟧ 스튜디오")).toBe(true);
    expect(translationTokensMismatch("⟦0⟧ at ⟦1⟧", "⟦0⟧ à")).toBe(true);
    expect(translationTokensMismatch("⟦0⟧ at ⟦1⟧", "⟦1⟧ à ⟦0⟧")).toBe(false);
    expect(translationTokensMismatch("plain", "simple")).toBe(false);
    expect(translationTokensMismatch("at Giang Metta Studio", "⟦Giang Metta Studio⟧에서")).toBe(true);
    expect(translationTokensMismatch("at ⟦0⟧", "⟦0⟧에서")).toBe(false);
  });
});

describe("translateFieldsToLocale", () => {
  it("omits the token instruction for token-free input and drops invented tokens", async () => {
    aiChatJson.mockResolvedValueOnce({ title: "사운드 배스", description: "⟦0⟧ 스튜디오에서" });
    const out = await translateFieldsToLocale(
      [
        { field_name: "title", text: "Sound Bath" },
        { field_name: "description", text: "At Giang Metta Studio" },
      ],
      "ko",
    );
    expect(aiChatJson.mock.calls[0][0].system).not.toContain(TOKEN_INSTRUCTION);
    expect(out).toEqual({ title: "사운드 배스" });
  });

  it("sends the token instruction when the input is shielded", async () => {
    aiChatJson.mockResolvedValueOnce({ description: "Au ⟦0⟧" });
    const out = await translateFieldsToLocale([{ field_name: "description", text: "At ⟦0⟧" }], "fr");
    expect(aiChatJson.mock.calls[1][0].system).toContain(TOKEN_INSTRUCTION);
    expect(out).toEqual({ description: "Au ⟦0⟧" });
  });
});
