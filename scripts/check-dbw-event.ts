// Check the DBW event details after re-import
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkEvent() {
  const { data: events } = await supabase
    .from('events')
    .select('id, slug, title, organizer_id, created_by, organizers(id, name, slug, logo_url), profiles(id, username, display_name, avatar_url)')
    .eq('slug', 'dbw-mid-week-check-in')
    .order('created_at', { ascending: false });

  if (!events || events.length === 0) {
    console.error('Event not found');
    return;
  }

  console.log(`Found ${events.length} event(s) with slug 'dbw-mid-week-check-in':\n`);

  events.forEach((event, index) => {
    console.log(`Event ${index + 1}:`);
    console.log('  ID:', event.id);
    console.log('  Title:', event.title);
    console.log('  Organizer ID:', event.organizer_id);
    console.log('  Organizer:', event.organizers);
    console.log('  Created By:', event.created_by);
    console.log('  Creator Profile:', event.profiles);
    console.log('');
  });
}

checkEvent();
