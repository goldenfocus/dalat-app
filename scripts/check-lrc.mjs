import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('event_materials')
  .select('id, title, artist, lyrics_lrc')
  .not('lyrics_lrc', 'is', null)
  .limit(1)
  .single();

if (error) {
  console.error('Error:', error);
} else {
  console.log('Track:', data.title, 'by', data.artist);
  console.log('\n=== LRC LYRICS ===\n');
  console.log(data.lyrics_lrc);
}
