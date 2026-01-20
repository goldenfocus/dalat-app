// Quick script to search for events by title
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function searchEvent(searchTerm: string) {
  console.log(`\nSearching for: "${searchTerm}"\n`);

  // Search by title (case-insensitive)
  const { data: byTitle, error: titleError } = await supabase
    .from('events')
    .select('id, slug, title, starts_at, source_platform, created_at, created_by, organizer_id, organizers(name)')
    .ilike('title', `%${searchTerm}%`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (titleError) {
    console.error('Error searching by title:', titleError);
  } else if (byTitle && byTitle.length > 0) {
    console.log(`Found ${byTitle.length} event(s) matching "${searchTerm}":\n`);
    byTitle.forEach((event, i) => {
      console.log(`${i + 1}. "${event.title}"`);
      console.log(`   Slug: ${event.slug}`);
      console.log(`   ID: ${event.id}`);
      console.log(`   Source: ${event.source_platform || 'manual'}`);
      console.log(`   Organizer ID: ${event.organizer_id}`);
      console.log(`   Organizer Name: ${(event as any).organizers?.name || 'N/A'}`);
      console.log(`   Created By: ${event.created_by}`);
      console.log(`   Created: ${new Date(event.created_at).toLocaleString()}`);
      console.log(`   URL: https://dalat.app/events/${event.slug}\n`);
    });
  } else {
    console.log(`No events found with title matching "${searchTerm}"`);
  }

  // Also show recent imports (last 10)
  console.log('\n--- Recent Imports (last 10) ---\n');
  const { data: recentImports } = await supabase
    .from('events')
    .select('id, slug, title, source_platform, created_at')
    .not('source_platform', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (recentImports && recentImports.length > 0) {
    recentImports.forEach((event, i) => {
      console.log(`${i + 1}. "${event.title}" (${event.source_platform})`);
      console.log(`   Slug: ${event.slug}`);
      console.log(`   Created: ${new Date(event.created_at).toLocaleString()}\n`);
    });
  } else {
    console.log('No imported events found.');
  }
}

const searchTerm = process.argv[2] || 'DBW';
searchEvent(searchTerm);
