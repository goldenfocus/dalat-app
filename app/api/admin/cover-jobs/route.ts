import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PROMPT_TEMPLATES } from '@/lib/ai/image-generator';

/**
 * Admin endpoint for the external cover-image worker (Mac mini).
 *
 * GET: Returns blog posts that need a cover image, each with a
 * server-built generation prompt. The worker generates the image
 * locally, uploads it to R2 via /presign, then calls /complete.
 */

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase service configuration missing');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Simple admin key check - in production you'd want something more robust
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    console.error('ADMIN_API_KEY not configured');
    return false;
  }

  return authHeader === `Bearer ${adminKey}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedLimit = parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isNaN(requestedLimit)
    ? 5
    : Math.min(Math.max(requestedLimit, 1), 10);

  const supabase = getServiceClient();

  const { data: posts, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, news_topic')
    .is('cover_image_url', null)
    .in('status', ['published', 'experimental'])
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const jobs = (posts ?? []).map((post) => ({
    id: post.id,
    slug: post.slug,
    title: post.title,
    prompt: PROMPT_TEMPLATES['blog-cover'](
      post.title,
      post.news_topic ?? undefined
    ),
  }));

  return NextResponse.json({ jobs });
}
