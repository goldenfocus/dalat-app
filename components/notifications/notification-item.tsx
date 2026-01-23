'use client';

import { formatDistanceToNow } from 'date-fns';
import { Bell, Calendar, Users, CheckCircle2, XCircle } from 'lucide-react';
import type { Notification, NotificationType } from '@/lib/notifications/types';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
  notification: Notification;
  onRead?: (id: string) => void | Promise<void>;
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'rsvp_confirmation':
    case 'waitlist_promotion':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'confirm_attendance_24h':
    case 'final_reminder_2h':
    case 'event_reminder':
      return <Calendar className="w-4 h-4 text-blue-500" />;
    case 'waitlist_position':
      return <Bell className="w-4 h-4 text-yellow-500" />;
    case 'new_rsvp':
      return <Users className="w-4 h-4 text-purple-500" />;
    case 'feedback_request':
      return <Bell className="w-4 h-4 text-orange-500" />;
    case 'event_invitation':
    case 'user_invitation':
      return <Calendar className="w-4 h-4 text-indigo-500" />;
    case 'tribe_join_request':
    case 'tribe_request_approved':
      return <Users className="w-4 h-4 text-green-500" />;
    case 'tribe_request_rejected':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'tribe_new_event':
      return <Calendar className="w-4 h-4 text-purple-500" />;
    default:
      return <Bell className="w-4 h-4 text-muted-foreground" />;
  }
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

  const handleClick = async () => {
    // Mark as read first and wait for it to complete before navigating
    if (!notification.read && onRead) {
      await onRead(notification.id);
    }

    // Navigate to primary action URL if available
    if (notification.primary_action_url) {
      window.location.href = notification.primary_action_url;
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors',
        'active:bg-muted active:scale-[0.99]',
        !notification.read && 'bg-muted/30'
      )}
    >
      <div className="mt-0.5 shrink-0">
        {getNotificationIcon(notification.type)}
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm leading-snug',
          !notification.read && 'font-medium'
        )}>
          {notification.title}
        </p>

        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        )}

        <p className="text-xs text-muted-foreground mt-1">
          {timeAgo}
        </p>
      </div>

      {!notification.read && (
        <div className="shrink-0 mt-1.5">
          <div className="w-2 h-2 rounded-full bg-primary" />
        </div>
      )}
    </button>
  );
}
