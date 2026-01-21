'use client';

import { useEffect, useRef } from 'react';
import { MessageCircle, WifiOff } from 'lucide-react';
import { useChatSubscription } from '@/lib/hooks/use-chat-subscription';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { cn } from '@/lib/utils';
import type { StreamChatMessageWithUser } from '@/lib/types';

interface StreamChatProps {
  eventId: string;
  currentUserId?: string;
  isEventCreator?: boolean;
  initialMessages?: StreamChatMessageWithUser[];
  className?: string;
}

export function StreamChat({
  eventId,
  currentUserId,
  isEventCreator = false,
  initialMessages = [],
  className,
}: StreamChatProps) {
  const { messages, isConnected, error, sendMessage, deleteMessage } = useChatSubscription({
    eventId,
    enabled: true,
    initialMessages,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  };

  const isAuthenticated = !!currentUserId;

  return (
    <div className={cn('flex flex-col h-full bg-background border rounded-lg overflow-hidden', className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          <span className="font-medium text-sm">Live Chat</span>
        </div>
        <div className="flex items-center gap-2">
          {!isConnected ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <WifiOff className="h-3 w-3" /><span>Connecting...</span>
            </div>
          ) : (
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          )}
        </div>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
            <MessageCircle className="h-8 w-8 mb-2 opacity-50" />
            <p>No messages yet</p>
            <p className="text-xs">Be the first to say something!</p>
          </div>
        ) : (
          <div className="py-2">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                isOwn={message.user_id === currentUserId}
                canDelete={message.user_id === currentUserId || isEventCreator}
                onDelete={deleteMessage}
              />
            ))}
          </div>
        )}
      </div>

      {error && <div className="px-3 py-2 bg-destructive/10 text-destructive text-xs">{error}</div>}

      {isAuthenticated ? (
        <ChatInput onSend={sendMessage} disabled={!isConnected} />
      ) : (
        <div className="px-3 py-3 border-t bg-muted/30 text-center text-sm text-muted-foreground">
          Sign in to join the chat
        </div>
      )}
    </div>
  );
}
