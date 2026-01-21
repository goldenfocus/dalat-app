'use client';

import { formatDistanceToNow } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StreamChatMessageWithUser } from '@/lib/types';

interface ChatMessageProps {
  message: StreamChatMessageWithUser;
  isOwn: boolean;
  canDelete: boolean;
  onDelete?: (messageId: string) => void;
}

export function ChatMessage({ message, isOwn, canDelete, onDelete }: ChatMessageProps) {
  const initials = message.user_name?.split(' ')?.map((n) => n[0])?.join('')?.toUpperCase()?.slice(0, 2) || '??';
  const timeAgo = formatDistanceToNow(new Date(message.created_at), { addSuffix: false });

  return (
    <div className={cn(
      'group flex gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors',
      message.message_type === 'system' && 'bg-muted/30 text-muted-foreground text-sm',
      message.message_type === 'highlight' && 'bg-primary/10 border-l-2 border-primary'
    )}>
      {message.message_type === 'text' && (
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={message.user_avatar || undefined} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1 min-w-0">
        {message.message_type === 'text' && (
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-sm truncate">{message.user_name || 'Anonymous'}</span>
            <span className="text-xs text-muted-foreground shrink-0">{timeAgo}</span>
          </div>
        )}
        <p className={cn('text-sm break-words', message.message_type === 'system' && 'italic')}>
          {message.content}
        </p>
      </div>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={() => onDelete?.(message.id)}
        >
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}
