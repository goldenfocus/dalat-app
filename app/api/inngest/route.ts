import { serve } from 'inngest/next';
import {
  inngest,
  processScheduledNotifications,
  onRsvpCreated,
  onRsvpCancelled,
  onRsvpInterested,
  onCommentCreated,
  dailyBlogSummary,
  dailyEventDiscovery,
  manualEventDiscovery,
  processMomentMetadata,
  processVideoWhenReady,
  processPendingMoments,
  reprocessMoment,
} from '@/lib/inngest';

// Create the Inngest API handler
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processScheduledNotifications,
    onRsvpCreated,
    onRsvpCancelled,
    onRsvpInterested,
    onCommentCreated,
    dailyBlogSummary,
    dailyEventDiscovery,
    manualEventDiscovery,
    // Moment AI processing
    processMomentMetadata,
    processVideoWhenReady,
    processPendingMoments,
    reprocessMoment,
  ],
});
