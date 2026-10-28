import { expect, it } from "vitest";
import { searchHtmlLimitedBots } from "./html-limited-bots";
it("delivers initial-head metadata to search and AI fetchers", () => {
  for (const ua of [
    "Googlebot/2.1",
    "OAI-SearchBot/1.4",
    "ChatGPT-User/1.0",
    "Claude-SearchBot/1.0",
    "Claude-User",
    "PerplexityBot/1.0",
    "Perplexity-User",
  ])
    expect(searchHtmlLimitedBots.test(ua)).toBe(true);
});
it("preserves social-preview defaults and normal browser streaming", () => {
  for (const ua of [
    "Twitterbot",
    "Slackbot",
    "Bingbot",
    "WhatsApp",
    "facebookexternalhit",
  ])
    expect(searchHtmlLimitedBots.test(ua)).toBe(true);
  expect(
    searchHtmlLimitedBots.test(
      "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
    ),
  ).toBe(false);
});
