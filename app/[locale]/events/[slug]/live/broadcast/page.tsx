import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/site-header';
import { BroadcasterInterface } from './broadcaster-interface';
import type { Metadata } from 'next';

export const maxDuration = 60;

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from('events').select('title').eq('slug', slug).single();
  return { title: event ? `Go Live - ${event.title}` : 'Go Live' };
}

export default async function BroadcastPage({ params }: PageProps) {
  const { slug, locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login?redirectTo=/events/${slug}/live/broadcast`);
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select(`id, slug, title, description, image_url, starts_at, ends_at, status, created_by`)
    .eq('slug', slug)
    .single();

  if (eventError || !event) notFound();
  if (event.status !== 'published') notFound();

  // Only event creator can broadcast
  if (event.created_by !== user.id) {
    redirect(`/${locale}/events/${slug}/live`);
  }

  // Check for existing stream
  const { data: existingStream } = await supabase
    .from('live_streams')
    .select('id, status, cf_stream_key, cf_playback_url, angle_label, started_at')
    .eq('event_id', event.id)
    .eq('broadcaster_id', user.id)
    .neq('status', 'ended')
    .single();

  return (
    <>
      <SiteHeader />
      <main className="container max-w-4xl mx-auto px-4 py-6">
        <BroadcasterInterface
          event={{
            id: event.id,
            slug: event.slug,
            title: event.title,
          }}
          existingStream={existingStream ? {
            id: existingStream.id,
            status: existingStream.status,
            streamKey: existingStream.cf_stream_key,
            playbackUrl: existingStream.cf_playback_url,
            angleLabel: existingStream.angle_label,
            startedAt: existingStream.started_at,
          } : null}
          locale={locale}
        />
      </main>
    </>
  );
}
