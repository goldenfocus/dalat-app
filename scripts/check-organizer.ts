// Check organizer details for an event
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkOrganizer() {
  const { data: event } = await supabase
    .from('events')
    .select('id, slug, title, organizer_id, created_by, organizers(id, name, slug, logo_url), profiles(id, username, avatar_url)')
    .eq('slug', 'dbw-mid-week-check-in')
    .single();

  if (!event) {
    console.error('Event not found');
    return;
  }

  console.log('Event:', event.title);
  console.log('\nOrganizer Data:');
  console.log('  organizer_id:', event.organizer_id);
  console.log('  organizers object:', event.organizers);
  console.log('\nCreator Data:');
  console.log('  created_by:', event.created_by);
  console.log('  profiles object:', event.profiles);
}

checkOrganizer();
