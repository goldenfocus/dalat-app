import { inngest } from '../../client';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Event Intelligence — Agent 5
 *
 * Triggered when an event is published. Creates content queue items
 * for event previews (before event) and event recaps (after event).
 */
export const eventIntelligence = inngest.createFunction(
  {
    id: 'seo-event-intelligence',
    name: 'SEO Event Intelligence',
    retries: 2,
  },
  { event: 'event/published' },
  async ({ event, step }) => {
    const eventId = event.data.eventId as string;

    const eventData = await step.run('load-event', async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('events')
        .select('id, title, description, starts_at, ends_at, location_name, ai_tags')
        .eq('id', eventId)
        .single();
      return data;
    });

    if (!eventData) return { skipped: true, reason: 'Event not found' };

    const startsAt = new Date(eventData.starts_at);
    const now = new Date();

    // Create event preview if event is in the future (more than 24h away)
    if (startsAt.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
      await step.run('queue-preview', async () => {
        const supabase = getSupabase();
        const { data: inserted } = await supabase
          .from('content_queue')
          .insert({
            content_type: 'event_preview',
            title: `Preview: ${eventData.title}`,
            brief: `Write an exciting preview for "${eventData.title}" happening at ${eventData.location_name || 'Dalat'} on ${startsAt.toISOString().split('T')[0]}. Cover what to expect, how to get there, and why to attend.`,
            priority: 70,
            target_keywords: eventData.ai_tags?.slice(0, 5) || [],
            assigned_agent: 'content-forge',
            status: 'pending',
            source_data: { eventId: eventData.id },
          })
          .select('id')
          .single();

        if (inserted) {
          await inngest.send({
            name: 'seo/content-requested',
            data: { queueItemId: inserted.id },
          });
        }
      });
    }

    // Schedule event recap for after the event ends
    if (eventData.ends_at) {
      const endsAt = new Date(eventData.ends_at);
      const delayMs = Math.max(endsAt.getTime() - now.getTime() + 2 * 60 * 60 * 1000, 0); // 2h after end

      if (delayMs > 0 && delayMs < 30 * 24 * 60 * 60 * 1000) { // within 30 days
        await step.sleepUntil('wait-for-event-end', new Date(now.getTime() + delayMs));

        await step.run('queue-recap', async () => {
          const supabase = getSupabase();

          // Check if there are moments from this event
          const { count } = await supabase
            .from('moments')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .eq('status', 'published');

          const { data: inserted } = await supabase
            .from('content_queue')
            .insert({
              content_type: 'event_recap',
              title: `Recap: ${eventData.title}`,
              brief: `Write a recap of "${eventData.title}". ${count || 0} community photos/videos were shared. Highlight the best moments and community energy.`,
              priority: 60,
              target_keywords: eventData.ai_tags?.slice(0, 5) || [],
              assigned_agent: 'content-forge',
              status: 'pending',
              source_data: { eventId: eventData.id, momentCount: count || 0 },
            })
            .select('id')
            .single();

          if (inserted) {
            await inngest.send({
              name: 'seo/content-requested',
              data: { queueItemId: inserted.id },
            });
          }
        });
      }
    }

    return { success: true, eventTitle: eventData.title };
  }
);
