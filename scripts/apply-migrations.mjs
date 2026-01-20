/**
 * Apply database migrations to Supabase
 * Run with: node scripts/apply-migrations.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase credentials
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://aljcmodwjqlznzcydyor.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_eTNSA7nPxkcohWiG29kYDA_2LaChHpC';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const migrations = [
  '20260301_001_add_event_price.sql',
  '20260301_002_event_categories.sql',
  '20260301_003_enable_postgis.sql',
  '20260301_004_filter_events_rpc.sql'
];

async function applyMigrations() {
  console.log('🚀 Starting migration process...\n');

  for (const migrationFile of migrations) {
    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', migrationFile);

    try {
      console.log(`📄 Reading migration: ${migrationFile}`);
      const sql = readFileSync(migrationPath, 'utf8');

      console.log(`⚡ Applying migration: ${migrationFile}`);
      const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

      if (error) {
        // Try direct query if exec_sql doesn't exist
        console.log('   Trying direct query method...');
        const result = await supabase.from('_migrations').select('*').limit(1);

        if (result.error) {
          throw new Error(`Migration failed: ${error.message}`);
        }

        console.log(`   ⚠️  Note: Please apply this migration manually via Supabase Studio`);
        console.log(`   SQL Dashboard URL: ${SUPABASE_URL}/project/_/sql/new`);
        console.log(`   Migration file: ${migrationFile}\n`);
      } else {
        console.log(`   ✅ Successfully applied: ${migrationFile}\n`);
      }
    } catch (err) {
      console.error(`   ❌ Error with ${migrationFile}:`, err.message);
      console.log(`   Please apply manually via Supabase Studio\n`);
    }
  }

  // Backfill existing events
  console.log('📦 Backfilling existing events with price_type...');
  try {
    const { error } = await supabase
      .from('events')
      .update({ price_type: 'free' })
      .is('price_type', null);

    if (error) {
      console.log(`   ⚠️  Backfill note: ${error.message}`);
    } else {
      console.log('   ✅ Successfully backfilled event prices\n');
    }
  } catch (err) {
    console.error('   ❌ Backfill error:', err.message, '\n');
  }

  // Test the RPC function
  console.log('🧪 Testing filter_events RPC...');
  try {
    const { data, error } = await supabase.rpc('filter_events', {
      p_lifecycle: 'upcoming',
      p_price_filter: 'all',
      p_limit: 5
    });

    if (error) {
      console.log(`   ⚠️  RPC test note: ${error.message}`);
      console.log(`   This is expected if migrations haven't been applied yet.\n`);
    } else {
      console.log(`   ✅ RPC function working! Returned ${data?.length || 0} events\n`);
    }
  } catch (err) {
    console.error('   ❌ RPC test error:', err.message, '\n');
  }

  console.log('✨ Migration process complete!');
  console.log('\n📋 Next steps:');
  console.log('1. If any migrations failed, apply them manually via Supabase Studio');
  console.log('2. Verify event_categories table has 12 rows');
  console.log('3. Test the filter_events RPC function');
  console.log(`\nSupabase Studio: ${SUPABASE_URL}/project/_/editor`);
}

applyMigrations().catch(console.error);
