'use client';

import { Radio, Video } from 'lucide-react';
import { Link } from '@/lib/i18n/routing';
import { Button } from '@/components/ui/button';
import { useStreamStatus } from '@/lib/hooks/use-stream-status';

interface WatchLiveButtonProps {
  eventId: string;
  eventSlug: string;
  isEventCreator: boolean;
  isHappening: boolean;
  className?: string;
}

/**
 * Button component for live streaming actions.
 * Shows "Watch Live" if there's an active stream, "Go Live" for event creator.
 */
export function WatchLiveButton({
  eventId,
  eventSlug,
  isEventCreator,
  isHappening,
  className,
}: WatchLiveButtonProps) {
  const { hasLiveStream, streams } = useStreamStatus({
    eventId,
    enabled: isHappening,
  });

  const totalViewers = streams.reduce((sum, s) => sum + s.current_viewers, 0);

  if (!isHappening) return null;

  if (hasLiveStream) {
    return (
      <Link href={`/events/${eventSlug}/live`} className={className}>
        <Button variant="destructive" className="w-full gap-2 animate-pulse hover:animate-none">
          <Radio className="h-4 w-4" />
          <span>Watch Live</span>
          {totalViewers > 0 && (
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">{totalViewers}</span>
          )}
        </Button>
      </Link>
    );
  }

  if (isEventCreator) {
    return (
      <Link href={`/events/${eventSlug}/live/broadcast`} className={className}>
        <Button variant="outline" className="w-full gap-2">
          <Video className="h-4 w-4" />
          <span>Go Live</span>
        </Button>
      </Link>
    );
  }

  return null;
}
