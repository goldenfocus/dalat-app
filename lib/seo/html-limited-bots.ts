import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots.js";

// Extend Next's installed defaults instead of replacing social-preview bots.
// These visitors receive complete metadata in <head>; normal browsers retain streaming.
// This is rendering compatibility only, never an authorization or WAF allow rule.
export const searchHtmlLimitedBots = new RegExp(
  `${HTML_LIMITED_BOT_UA_RE.source}|Googlebot|OAI-SearchBot|ChatGPT-User|Claude-SearchBot|Claude-User|PerplexityBot|Perplexity-User`,
  "i",
);
