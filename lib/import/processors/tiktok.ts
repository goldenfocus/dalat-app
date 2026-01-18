import { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { TikTokPost, ExtractedEvent } from "../types";
import {
  slugify,
  generateUniqueSlug,
  checkDuplicateByUrl,
  parseEventDate,
  createEmptyResult,
  type ProcessResult,
} from "../utils";

export async function processTikTokPosts(
  supabase: SupabaseClient,
  posts: TikTokPost[]
): Promise<ProcessResult> {
  const result = createEmptyResult();
  const client = new Anthropic();

  for (const post of posts) {
    try {
      const caption = post.text || post.description;
      if (!caption) {
        result.skipped++;
        continue;
      }

      // Use AI to extract event info
      const extracted = await extractEventFromTikTok(client, caption);

      if (!extracted.isEvent || !extracted.title || !extracted.date) {
        result.skipped++;
        continue;
      }

      const postUrl = post.url || post.webVideoUrl;
      if (!postUrl) {
        result.skipped++;
        continue;
      }

      // Check for duplicates
      if (await checkDuplicateByUrl(supabase, postUrl)) {
        result.skipped++;
        continue;
      }

      const startsAt = parseEventDate(extracted.date, extracted.time);
      if (!startsAt) {
        result.skipped++;
        continue;
      }

      const slug = await generateUniqueSlug(supabase, slugify(extracted.title));
      const coverImage = post.videoMeta?.coverUrl || post.covers?.[0];

      const { error } = await supabase.from("events").insert({
        slug,
        title: extracted.title,
        description: extracted.description || caption,
        starts_at: startsAt,
        location_name: extracted.location || post.locationCreated,
        external_chat_url: postUrl,
        image_url: coverImage,
        status: "pending_review",
        timezone: "Asia/Ho_Chi_Minh",
        source_platform: "tiktok",
        source_metadata: {
          author_name: post.authorMeta?.nickName || post.authorMeta?.name,
          hashtags: post.hashtags?.map((h) => h.name),
          digg_count: post.diggCount,
          share_count: post.shareCount,
          extracted_by_ai: true,
          imported_at: new Date().toISOString(),
        },
      });

      if (error) {
        result.errors++;
        result.details.push(`Error: ${extracted.title} - ${error.message}`);
      } else {
        result.processed++;
      }
    } catch (err) {
      result.errors++;
      result.details.push(`Exception: ${post.url || post.webVideoUrl} - ${err}`);
    }
  }

  return result;
}

async function extractEventFromTikTok(
  client: Anthropic,
  caption: string
): Promise<ExtractedEvent> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-20250514",
      max_tokens: 500,
      system: `You analyze TikTok captions to detect events in Da Lat, Vietnam.
Return JSON only, no markdown. Structure:
{
  "isEvent": boolean,
  "title": "event name if found",
  "description": "brief description",
  "date": "ISO date or 'January 15, 2026' format",
  "time": "start time if mentioned",
  "location": "venue name if mentioned"
}

Only isEvent=true for clear upcoming event promotions.`,
      messages: [{ role: "user", content: caption }],
    });

    const text = response.content[0];
    if (text.type !== "text") {
      return { isEvent: false };
    }

    return JSON.parse(text.text);
  } catch {
    return { isEvent: false };
  }
}
