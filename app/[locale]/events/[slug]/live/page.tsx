import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/site-header';
import { ViewerInterface } from './viewer-interface';
import type { Metadata } from 'next';

export const maxDuration = 60;

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from('events').select('title').eq('slug', slug).single();
  return { title: event ? `Watch Live - ${event.title}` : 'Watch Live' };
}

export default async function LiveViewerPage({ params }: PageProps) {
  const { slug, locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select(`id, slug, title, description, image_url, starts_at, ends_at, status, created_by,
      profiles!created_by (id, username, display_name, avatar_url)`)
    .eq('slug', slug)
    .single();

  if (eventError || !event) notFound();
  if (event.status !== 'published') notFound();

  const { data: initialMessages } = await supabase.rpc('get_stream_chat_messages', {
    p_event_id: event.id,
    p_limit: 50,
    p_before: null,
  });

  const isEventCreator = user?.id === event.created_by;

  return (
    <>
      <SiteHeader />
      <main className="container max-w-6xl mx-auto px-4 py-6">
        <ViewerInterface
          event={{
            id: event.id,
            slug: event.slug,
            title: event.title,
            description: event.description,
            imageUrl: event.image_url,
            startsAt: event.starts_at,
            endsAt: event.ends_at,
            creator: event.profiles as {
              id: string;
              username: string | null;
              display_name: string | null;
              avatar_url: string | null;
            },
          }}
          currentUserId={user?.id}
          isEventCreator={isEventCreator}
          initialMessages={initialMessages || []}
          locale={locale}
        />
      </main>
    </>
  );
}
