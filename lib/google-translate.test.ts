import { describe, expect, it, vi } from "vitest";

const aiChatJson = vi.fn();
vi.mock("@/lib/ai/provider", () => ({ aiChatJson: (...args: unknown[]) => aiChatJson(...args) }));

import {
  TOKEN_INSTRUCTION,
  translateFieldsToLocale,
  translationMaxTokens,
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

describe("Thai output budget", () => {
  it("gives token-heavy scripts more room than Latin targets", () => {
    expect(translationMaxTokens(600, "th")).toBe(1800);
    expect(translationMaxTokens(600, "fr")).toBe(512);
    expect(translationMaxTokens(100, "th")).toBe(1024);
    expect(translationMaxTokens(20_000, "th")).toBe(8000);
  });

  it("retries a truncated JSON response once with double the budget", async () => {
    aiChatJson.mockReset();
    aiChatJson
      .mockRejectedValueOnce(new SyntaxError("Unterminated string in JSON at position 501"))
      .mockResolvedValueOnce({ title: "ชมรมสเก็ตช์สุดสัปดาห์" });
    const out = await translateFieldsToLocale([{ field_name: "title", text: "Weekend Sketch Club" }], "th");
    expect(out).toEqual({ title: "ชมรมสเก็ตช์สุดสัปดาห์" });
    expect(aiChatJson).toHaveBeenCalledTimes(2);
    expect(aiChatJson.mock.calls[1][0].maxTokens).toBe(aiChatJson.mock.calls[0][0].maxTokens * 2);
  });

  it("does not retry provider failures", async () => {
    aiChatJson.mockReset();
    aiChatJson.mockRejectedValueOnce(new Error("All AI providers failed: 503"));
    await expect(translateFieldsToLocale([{ field_name: "title", text: "Hi" }], "th")).rejects.toThrow("503");
    expect(aiChatJson).toHaveBeenCalledTimes(1);
  });
});
