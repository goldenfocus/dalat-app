/**
 * Tiered cover-image generation chain for blog/news posts.
 *
 * Tier 1: Cloudflare Workers AI (flux-1-schnell) — cheap and fast
 * Tier 2: Gemini (existing generateCoverImage)
 *
 * Every tier attempt is logged to content_pipeline_events so cover failures
 * are visible instead of vanishing into console.error. Never throws.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PROMPT_TEMPLATES } from '@/lib/ai/image-generator';
import { generateCoverImage } from '@/lib/blog/cover-generator';
import { getStorageProvider } from '@/lib/storage';
import { logPipelineEvent, getPipelineLogClient } from '@/lib/news/pipeline-log';

const WORKERS_AI_MODEL = '@cf/black-forest-labs/flux-1-schnell';

interface CoverChainInput {
  postId?: string;
  slug: string;
  title: string;
  description?: string;
}

/**
 * Generate a cover image via the tiered chain. Returns the CDN URL and the
 * tier that produced it, or null if every tier failed. Never throws.
 */
export async function generateCoverViaChain(
  input: CoverChainInput,
  supabase?: SupabaseClient
): Promise<{ url: string; tier: 'workers-ai' | 'gemini' } | null> {
  const client = supabase ?? getPipelineLogClient();

  const log = async (
    level: 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>
  ) => {
    console[level === 'info' ? 'log' : level](`[cover-chain] ${message}`, meta ?? '');
    if (client) {
      await logPipelineEvent(client, {
        stage: 'cover-chain',
        postId: input.postId ?? null,
        level,
        message,
        meta: { slug: input.slug, ...meta },
      });
    }
  };

  const prompt = PROMPT_TEMPLATES['blog-cover'](input.title, input.description);

  // --- Tier 1: Cloudflare Workers AI (flux-1-schnell) ---
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token =
    process.env.CLOUDFLARE_WORKERS_AI_TOKEN || process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !token) {
    await log('warn', 'Workers AI skipped: CLOUDFLARE_ACCOUNT_ID or API token not configured');
  } else {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${WORKERS_AI_MODEL}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt, steps: 8 }),
        }
      );

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        await log('error', `Workers AI HTTP ${response.status}`, {
          status: response.status,
          body: body.slice(0, 300),
        });
      } else {
        const json = (await response.json()) as { result?: { image?: string } };
        const base64 = json.result?.image;

        if (!base64 || typeof base64 !== 'string') {
          await log('error', 'Workers AI response contained no image');
        } else {
          const buffer = Buffer.from(base64, 'base64');
          const hash = Math.random().toString(36).slice(2, 8);
          const fileName = `covers/${input.slug}-${hash}.png`;

          const provider = await getStorageProvider('blog-media');
          const url = await provider.upload('blog-media', fileName, buffer, {
            contentType: 'image/png',
            cacheControl: '31536000',
          });

          await log('info', 'Workers AI cover generated', { url });
          return { url, tier: 'workers-ai' };
        }
      }
    } catch (error) {
      await log('error', `Workers AI request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // --- Tier 2: Gemini (existing generator) ---
  try {
    const url = await generateCoverImage(input.slug, prompt);

    if (url) {
      await log('info', 'Gemini cover generated', { url });
      return { url, tier: 'gemini' };
    }

    await log('error', 'Gemini cover generation returned null');
  } catch (error) {
    await log('error', `Gemini cover generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return null;
}
