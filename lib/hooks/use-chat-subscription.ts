'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { StreamChatMessageWithUser } from '@/lib/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseChatSubscriptionOptions {
  eventId: string;
  enabled?: boolean;
  initialMessages?: StreamChatMessageWithUser[];
}

interface UseChatSubscriptionReturn {
  messages: StreamChatMessageWithUser[];
  isConnected: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;
}

/**
 * Hook for subscribing to live chat messages via Supabase Realtime.
 *
 * Messages are received in real-time through Supabase's broadcast channel.
 * This provides sub-second latency for chat updates.
 */
export function useChatSubscription({
  eventId,
  enabled = true,
  initialMessages = [],
}: UseChatSubscriptionOptions): UseChatSubscriptionReturn {
  const [messages, setMessages] = useState<StreamChatMessageWithUser[]>(initialMessages);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(createClient());

  // Fetch user profile for new messages
  const fetchUserProfile = useCallback(
    async (userId: string): Promise<{ name: string | null; avatar: string | null }> => {
      const { data } = await supabaseRef.current
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', userId)
        .single();

      return {
        name: data?.full_name ?? null,
        avatar: data?.avatar_url ?? null,
      };
    },
    []
  );

  // Subscribe to realtime changes
  useEffect(() => {
    if (!enabled || !eventId) return;

    const supabase = supabaseRef.current;

    // Subscribe to INSERT events on stream_chat_messages
    const channel = supabase
      .channel(`chat:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stream_chat_messages',
          filter: `event_id=eq.${eventId}`,
        },
        async (payload) => {
          const newMessage = payload.new as {
            id: string;
            user_id: string;
            content: string;
            message_type: 'text' | 'system' | 'highlight';
            created_at: string;
          };

          // Fetch user profile for the new message
          const profile = await fetchUserProfile(newMessage.user_id);

          const messageWithUser: StreamChatMessageWithUser = {
            id: newMessage.id,
            user_id: newMessage.user_id,
            user_name: profile.name,
            user_avatar: profile.avatar,
            content: newMessage.content,
            message_type: newMessage.message_type,
            created_at: newMessage.created_at,
          };

          setMessages((prev) => [...prev, messageWithUser]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stream_chat_messages',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; is_deleted: boolean };

          if (updated.is_deleted) {
            // Remove deleted message from list
            setMessages((prev) =>
              prev.filter((msg) => msg.id !== updated.id)
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setError(null);
        } else if (status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setError('Failed to connect to chat');
        } else if (status === 'CLOSED') {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [eventId, enabled, fetchUserProfile]);

  // Send a new message
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!content.trim()) return false;

      const supabase = supabaseRef.current;

      const { error: sendError } = await supabase.rpc(
        'send_stream_chat_message',
        {
          p_event_id: eventId,
          p_content: content.trim(),
        }
      );

      if (sendError) {
        console.error('Failed to send message:', sendError);
        setError('Failed to send message');
        return false;
      }

      return true;
    },
    [eventId]
  );

  // Delete a message
  const deleteMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      const supabase = supabaseRef.current;

      const { error: deleteError } = await supabase.rpc(
        'delete_stream_chat_message',
        {
          p_message_id: messageId,
        }
      );

      if (deleteError) {
        console.error('Failed to delete message:', deleteError);
        setError('Failed to delete message');
        return false;
      }

      return true;
    },
    []
  );

  return {
    messages,
    isConnected,
    error,
    sendMessage,
    deleteMessage,
  };
}
