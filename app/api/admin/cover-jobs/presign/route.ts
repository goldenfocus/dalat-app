import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { R2StorageProvider } from '@/lib/storage/r2';
import { isR2Configured } from '@/lib/storage';

/**
 * Presign an R2 upload for the external cover-image worker.
 *
 * POST { postId, contentType } -> { uploadUrl, key, publicUrl }
 *
 * The worker PUTs the image bytes directly to R2 (Cloudflare WAF blocks
 * binary POSTs through dalat.app — NEVER route image bytes through the app).
 */

const LOGICAL_BUCKET = 'blog-media';

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

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
  const { postId, contentType } = body as {
    postId?: string;
    contentType?: string;
  };

  if (!postId || !contentType) {
    return NextResponse.json(
      { error: 'Missing required fields: postId, contentType' },
      { status: 400 }
    );
  }

  const ext = ALLOWED_CONTENT_TYPES[contentType];
  if (!ext) {
    return NextResponse.json(
      { error: 'contentType must be image/png, image/jpeg, or image/webp' },
      { status: 400 }
    );
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: 'R2 storage not configured' },
      { status: 503 }
    );
  }

  const supabase = getServiceClient();
  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('slug')
    .eq('id', postId)
    .single();

  if (error || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const filename = `${post.slug}-${randomBytes(4).toString('hex')}.${ext}`;
  const key = `${LOGICAL_BUCKET}/${filename}`;

  const provider = new R2StorageProvider();
  const uploadUrl = await provider.createPresignedUploadUrl(
    LOGICAL_BUCKET,
    filename,
    { contentType, expiresIn: 600 } // 10 minutes
  );

  return NextResponse.json({
    uploadUrl,
    key,
    publicUrl: `https://cdn.dalat.app/${key}`,
  });
}
