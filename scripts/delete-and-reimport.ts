// Delete and re-import an event to trigger translations
import { createClient } from '@supabase/supabase-js';

const eventId = '397fbbb2-3fc4-4caf-a0b9-608fc9f255b2';
const lumaUrl = 'https://lu.ma/dbw-midweek';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteAndReimport() {
  console.log('Step 1: Deleting old event...');

  const { error: deleteError } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (deleteError) {
    console.error('Delete failed:', deleteError);
    process.exit(1);
  }

  console.log('✓ Event deleted');
  console.log('\nStep 2: Re-import from Lu.ma...');
  console.log('Please go to https://dalat.app/admin/import and paste this URL:');
  console.log(lumaUrl);
  console.log('\nThe new import will automatically translate to all 12 languages!');
}

deleteAndReimport();
