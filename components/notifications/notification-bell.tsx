'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/lib/notifications/types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { NotificationItem } from './notification-item';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  userId: string;
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[notification-bell] Error fetching notifications:', error.message);
      return;
    }

    setNotifications(data as Notification[]);
    setUnreadCount(data.filter((n: Notification) => !n.read).length);
    setIsLoading(false);
  }, [supabase, userId]);

  // Subscribe to real-time updates
  useEffect(() => {
    fetchNotifications();

    let pollInterval: NodeJS.Timeout | null = null;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<Notification>) => {
          console.log('[notification-bell] Realtime INSERT received:', payload.new);
          const newNotification = payload.new as Notification;
          setNotifications((prev) => [newNotification, ...prev].slice(0, 20));
          setUnreadCount((prev) => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<Notification>) => {
          console.log('[notification-bell] Realtime UPDATE received:', payload.new);
          const updated = payload.new as Notification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n))
          );
          // Recalculate unread count
          setNotifications((prev) => {
            setUnreadCount(prev.filter((n) => !n.read).length);
            return prev;
          });
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (status === 'SUBSCRIBED') {
          // Realtime is working - no polling needed
          console.log('[notification-bell] Realtime connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Realtime failed - fall back to polling (expected in some environments)
          if (process.env.NODE_ENV === 'development') {
            console.info('[notification-bell] Realtime unavailable, using polling');
          }
          pollInterval = setInterval(() => {
            fetchNotifications();
          }, 30000);
        } else if (err) {
          // Log other errors for debugging
          console.error('[notification-bell] Realtime error:', status, err.message);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [supabase, userId, fetchNotifications]);

  // Mark a single notification as read
  const handleMarkRead = async (notificationId: string) => {
    // Optimistic update first - update UI immediately
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, read: true, read_at: new Date().toISOString() } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    // Then persist to database
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (error) {
      console.error('[notification-bell] Error marking read:', error.message);
      // Optionally: revert optimistic update on error
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    const { error } = await supabase.rpc('mark_all_notifications_read', {
      p_user_id: userId,
    });

    if (error) {
      console.error('[notification-bell] Error marking all read:', error.message);
      return;
    }

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() }))
    );
    setUnreadCount(0);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative p-2 -ml-2',
            'active:scale-95 transition-all'
          )}
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 p-0 max-h-[70vh] overflow-hidden flex flex-col"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto py-1 px-2"
              onClick={handleMarkAllRead}
            >
              Mark all read
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={handleMarkRead}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
