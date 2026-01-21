'use client';

import { ArrowLeft, Radio, Video } from 'lucide-react';
import { Link } from '@/lib/i18n/routing';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StreamPlayer, StreamChat, StreamStatusBadge } from '@/components/streaming';
import { useStreamStatus } from '@/lib/hooks/use-stream-status';
import type { StreamChatMessageWithUser } from '@/lib/types';

interface ViewerInterfaceProps {
  event: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
    startsAt: string;
    endsAt: string | null;
    creator: { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
  };
  currentUserId?: string;
  isEventCreator: boolean;
  initialMessages: StreamChatMessageWithUser[];
  locale: string;
}

export function ViewerInterface({
  event,
  currentUserId,
  isEventCreator,
  initialMessages,
  locale,
}: ViewerInterfaceProps) {
  const { streams, hasLiveStream } = useStreamStatus({ eventId: event.id, enabled: true });
  const liveStream = streams.find((s) => s.status === 'live' || s.status === 'connecting' || s.status === 'reconnecting');
  const totalViewers = streams.reduce((sum, s) => sum + s.current_viewers, 0);
  const creatorInitials = event.creator.display_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '??';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/events/${event.slug}`}
          className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" /><span>Back to event</span>
        </Link>
        <div className="flex items-center gap-3">
          {hasLiveStream && <StreamStatusBadge status="live" viewerCount={totalViewers} size="md" />}
          {isEventCreator && (
            <Link href={`/events/${event.slug}/live/broadcast`}>
              <Button variant="outline" size="sm"><Video className="h-4 w-4 mr-2" />Go Live</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {hasLiveStream && liveStream ? (
            <StreamPlayer playbackUrl={liveStream.cf_playback_url} autoplay={true} muted={true} className="rounded-lg overflow-hidden" />
          ) : (
            <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center">
              <Radio className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <h2 className="text-lg font-medium mb-1">No active stream</h2>
              <p className="text-muted-foreground text-sm">The stream hasn&apos;t started yet. Check back soon!</p>
            </div>
          )}

          <div className="space-y-3">
            <h1 className="text-xl font-bold">{event.title}</h1>
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={event.creator.avatar_url || undefined} />
                <AvatarFallback>{creatorInitials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{event.creator.display_name || event.creator.username || 'Unknown'}</p>
                <p className="text-sm text-muted-foreground">Event host</p>
              </div>
            </div>
            {liveStream && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {liveStream.angle_label && <span className="bg-muted px-2 py-1 rounded">{liveStream.angle_label}</span>}
                {liveStream.started_at && (
                  <span>Started {new Date(liveStream.started_at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</span>
                )}
              </div>
            )}
            {event.description && <p className="text-muted-foreground line-clamp-3">{event.description}</p>}
          </div>
        </div>

        <div className="lg:col-span-1">
          <StreamChat
            eventId={event.id}
            currentUserId={currentUserId}
            isEventCreator={isEventCreator}
            initialMessages={initialMessages}
            className="h-[400px] lg:h-[calc(100vh-200px)] lg:max-h-[700px]"
          />
        </div>
      </div>
    </div>
  );
}
