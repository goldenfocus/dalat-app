'use client';

import { Radio, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LiveStreamStatus } from '@/lib/types';

interface StreamStatusBadgeProps {
  status: LiveStreamStatus;
  viewerCount?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StreamStatusBadge({
  status,
  viewerCount,
  size = 'md',
  className,
}: StreamStatusBadgeProps) {
  const isLive = status === 'live' || status === 'connecting' || status === 'reconnecting';

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-2.5 py-1',
  };

  const iconSizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
  };

  if (!isLive) return null;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Badge
        variant="destructive"
        className={cn(
          'flex items-center gap-1 font-semibold',
          sizeClasses[size],
          status === 'reconnecting' && 'animate-pulse'
        )}
      >
        <Radio className={cn(iconSizes[size], 'animate-pulse')} />
        <span>LIVE</span>
      </Badge>
      {viewerCount !== undefined && viewerCount > 0 && (
        <Badge variant="secondary" className={cn('flex items-center gap-1', sizeClasses[size])}>
          <Users className={iconSizes[size]} />
          <span>{viewerCount.toLocaleString()}</span>
        </Badge>
      )}
    </div>
  );
}
