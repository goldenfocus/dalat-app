import { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { InstagramPost, ExtractedEvent } from "../types";
import {
  slugify,
  generateUniqueSlug,
  checkDuplicateByUrl,
  parseEventDate,
  createEmptyResult,
  downloadAndUploadImage,
  type ProcessResult,
} from "../utils";

export async function processInstagramPosts(
  supabase: SupabaseClient,
  posts: InstagramPost[]
): Promise<ProcessResult> {
  const result = createEmptyResult();
  const client = new Anthropic();

  for (const post of posts) {
    try {
      // Skip posts without captions
      if (!post.caption) {
        result.skipped++;
        continue;
      }

      // Use AI to determine if this is an event
      const extracted = await extractEventFromCaption(client, post.caption);

      if (!extracted.isEvent || !extracted.title || !extracted.date) {
        result.skipped++;
        continue;
      }

      // Check for duplicates
      if (await checkDuplicateByUrl(supabase, post.url)) {
        result.skipped++;
        continue;
      }

      // Parse date
      const startsAt = parseEventDate(extracted.date, extracted.time);
      if (!startsAt) {
        result.skipped++;
        result.details.push(`Could not parse date: ${extracted.date}`);
        continue;
      }

      const slug = await generateUniqueSlug(supabase, slugify(extracted.title));

      // Download and re-upload image to our storage (external CDN URLs expire)
      const imageUrl = await downloadAndUploadImage(
        supabase,
        post.displayUrl || post.images?.[0],
        slug
      );

      const { error } = await supabase.from("events").insert({
        slug,
        title: extracted.title,
        description: extracted.description || post.caption,
        starts_at: startsAt,
        location_name: extracted.location || post.locationName,
        external_chat_url: post.url,
        image_url: imageUrl,
        status: "pending_review", // IG events need manual review
        timezone: "Asia/Ho_Chi_Minh",
        source_platform: "instagram",
        source_metadata: {
          owner_username: post.ownerUsername,
          hashtags: post.hashtags,
          likes_count: post.likesCount,
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
      result.details.push(`Exception: ${post.url} - ${err}`);
    }
  }

  return result;
}

async function extractEventFromCaption(
  client: Anthropic,
  caption: string
): Promise<ExtractedEvent> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-20250514",
      max_tokens: 500,
      system: `You analyze Instagram captions to detect events in Da Lat, Vietnam.
Return JSON only, no markdown. Structure:
{
  "isEvent": boolean,
  "title": "event name if found",
  "description": "brief description",
  "date": "ISO date or 'January 15, 2026' format",
  "time": "start time if mentioned",
  "location": "venue name if mentioned",
  "ticketInfo": "ticket/price info if mentioned"
}

Only isEvent=true if this clearly promotes an upcoming event (concert, workshop, party, festival, etc).
Regular posts about past events or general content should be isEvent=false.`,
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
