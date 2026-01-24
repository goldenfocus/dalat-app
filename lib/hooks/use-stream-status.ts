'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { LiveStreamWithBroadcaster, LiveStreamStatus } from '@/lib/types';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseStreamStatusOptions {
  eventId: string;
  enabled?: boolean;
}

interface UseStreamStatusReturn {
  streams: LiveStreamWithBroadcaster[];
  isConnected: boolean;
  hasLiveStream: boolean;
  refetch: () => Promise<void>;
}

export function useStreamStatus({
  eventId,
  enabled = true,
}: UseStreamStatusOptions): UseStreamStatusReturn {
  const [streams, setStreams] = useState<LiveStreamWithBroadcaster[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(createClient());

  const fetchStreams = async () => {
    const supabase = supabaseRef.current;

    const { data, error } = await supabase.rpc('get_event_streams', {
      p_event_id: eventId,
    });

    if (error) {
      console.error('Failed to fetch streams:', error);
      return;
    }

    setStreams(
      (data || []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        broadcaster_id: s.broadcaster_id as string,
        broadcaster_name: s.broadcaster_name as string | null,
        broadcaster_avatar: s.broadcaster_avatar as string | null,
        title: s.title as string | null,
        angle_label: s.angle_label as string,
        status: s.status as LiveStreamStatus,
        cf_playback_url: s.cf_playback_url as string | null,
        current_viewers: s.current_viewers as number,
        started_at: s.started_at as string | null,
      }))
    );
  };

  useEffect(() => {
    if (!enabled || !eventId) return;

    const supabase = supabaseRef.current;

    fetchStreams();

    const channel = supabase
      .channel(`streams:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_streams',
          filter: `event_id=eq.${eventId}`,
        },
        async (payload: RealtimePostgresChangesPayload<{ id: string }>) => {
          const { eventType } = payload;
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            await fetchStreams();
          } else if (eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setStreams((prev) => prev.filter((s) => s.id !== deletedId));
          }
        }
      )
      .subscribe((status: string) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [eventId, enabled]);

  const hasLiveStream = streams.some(
    (s) => s.status === 'live' || s.status === 'connecting' || s.status === 'reconnecting'
  );

  return {
    streams,
    isConnected,
    hasLiveStream,
    refetch: fetchStreams,
  };
}
