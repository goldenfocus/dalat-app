import { serve } from 'inngest/next';
import {
  inngest,
  processScheduledNotifications,
  onRsvpCreated,
  onRsvpCancelled,
  onRsvpInterested,
} from '@/lib/inngest';

// Create the Inngest API handler
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processScheduledNotifications,
    onRsvpCreated,
    onRsvpCancelled,
    onRsvpInterested,
  ],
});
