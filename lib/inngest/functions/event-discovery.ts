import { inngest } from '../client';
import { createClient } from '@supabase/supabase-js';
import {
  discoverTicketGoEvents,
  fetchTicketGoEvent,
  processTicketGoEvents,
} from '@/lib/import/processors/ticketgo';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily event discovery - runs at 6 AM Vietnam time (11 PM UTC previous day)
 * Scrapes event platforms for new Đà Lạt events
 */
export const dailyEventDiscovery = inngest.createFunction(
  {
    id: 'daily-event-discovery',
    name: 'Daily Event Discovery',
  },
  { cron: '0 23 * * *' }, // 11 PM UTC = 6 AM Vietnam
  async ({ step }) => {
    const systemUserId = process.env.SYSTEM_USER_ID;

    // Step 1: Discover TicketGo events for Đà Lạt
    const ticketgoUrls = await step.run('discover-ticketgo', async () => {
      // Try multiple search URLs for broader coverage
      const searchUrls = [
        'https://ticketgo.vn/khu-vuc/da-lat',
        'https://ticketgo.vn/khu-vuc/lam-dong',
      ];

      const allUrls: string[] = [];
      for (const searchUrl of searchUrls) {
        try {
          const urls = await discoverTicketGoEvents(searchUrl);
          for (const url of urls) {
            if (!allUrls.includes(url)) {
              allUrls.push(url);
            }
          }
        } catch (error) {
          console.error(`Error discovering from ${searchUrl}:`, error);
        }
      }

      return allUrls;
    });

    if (ticketgoUrls.length === 0) {
      return { success: true, message: 'No new TicketGo events discovered' };
    }

    // Step 2: Fetch and process each event
    const results = await step.run('process-ticketgo-events', async () => {
      const supabase = getSupabase();
      const events = [];

      for (const url of ticketgoUrls) {
        try {
          const event = await fetchTicketGoEvent(url);
          if (event) {
            events.push(event);
          }
        } catch (error) {
          console.error(`Error fetching ${url}:`, error);
        }
      }

      if (events.length === 0) {
        return { processed: 0, skipped: 0, errors: 0, message: 'No events fetched' };
      }

      return processTicketGoEvents(supabase, events, systemUserId);
    });

    return {
      success: true,
      discovered: ticketgoUrls.length,
      processed: results.processed,
      skipped: results.skipped,
      errors: results.errors,
    };
  }
);

/**
 * Manual event scrape - triggered via API for on-demand discovery
 * Use event: "event/discover" with data: { sources: ["ticketgo"], searchUrls?: string[] }
 */
export const manualEventDiscovery = inngest.createFunction(
  {
    id: 'manual-event-discovery',
    name: 'Manual Event Discovery',
  },
  { event: 'event/discover' },
  async ({ event, step }) => {
    const { sources = ['ticketgo'], searchUrls } = event.data as {
      sources?: string[];
      searchUrls?: string[];
    };
    const systemUserId = process.env.SYSTEM_USER_ID;

    const results: Record<string, unknown> = {};

    if (sources.includes('ticketgo')) {
      results.ticketgo = await step.run('discover-ticketgo', async () => {
        const supabase = getSupabase();

        // Use provided URLs or defaults
        const urls = searchUrls || ['https://ticketgo.vn/khu-vuc/da-lat'];
        const allEventUrls: string[] = [];

        for (const url of urls) {
          const discovered = await discoverTicketGoEvents(url);
          allEventUrls.push(...discovered);
        }

        const events = [];
        for (const url of allEventUrls) {
          const event = await fetchTicketGoEvent(url);
          if (event) events.push(event);
        }

        if (events.length === 0) {
          return { discovered: 0, processed: 0 };
        }

        const processResult = await processTicketGoEvents(supabase, events, systemUserId);
        return {
          discovered: allEventUrls.length,
          ...processResult,
        };
      });
    }

    return { success: true, results };
  }
);
