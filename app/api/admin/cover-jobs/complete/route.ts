import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Mark a cover-image job complete.
 *
 * POST { postId, key } — sets blog_posts.cover_image_url to the CDN URL
 * for the uploaded R2 object. Only fills empty covers (never overwrites).
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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { postId, key } = body as { postId?: string; key?: string };

  if (!postId || !key) {
    return NextResponse.json(
      { error: 'Missing required fields: postId, key' },
      { status: 400 }
    );
  }

  if (!key.startsWith('blog-media/')) {
    return NextResponse.json(
      { error: 'key must start with blog-media/' },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  const { data: post, error: fetchError } = await supabase
    .from('blog_posts')
    .select('title')
    .eq('id', postId)
    .single();

  if (fetchError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const coverImageUrl = `https://cdn.dalat.app/${key}`;

  const { error: updateError } = await supabase
    .from('blog_posts')
    .update({
      cover_image_url: coverImageUrl,
      cover_image_alt: post.title,
    })
    .eq('id', postId)
    .is('cover_image_url', null);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Pipeline observability — table may not exist yet, never fail the request
  try {
    const { error: eventError } = await supabase
      .from('content_pipeline_events')
      .insert({
        stage: 'cover-worker',
        post_id: postId,
        level: 'info',
        message: 'cover set by external worker',
        meta: { key },
      });
    if (eventError) {
      console.error(
        '[cover-jobs/complete] pipeline event insert failed:',
        eventError.message
      );
    }
  } catch (err) {
    console.error('[cover-jobs/complete] pipeline event insert failed:', err);
  }

  return NextResponse.json({ ok: true, coverImageUrl });
}
