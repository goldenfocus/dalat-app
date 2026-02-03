import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync('.env.local', 'utf8');
const url = envFile.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)?.[1];
const key = envFile.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1];

if (!url || !key) { console.log('Missing env vars'); process.exit(1); }

console.log('URL:', url);
console.log('Key prefix:', key.substring(0, 10) + '...');

// Create Supabase client
const supabase = createClient(url, key);

// Get stored embedding via Supabase client
console.log('\n--- Fetching stored embedding via Supabase client ---');
const { data: stored, error: storedError } = await supabase
  .from('moment_embeddings')
  .select('moment_id, embedding')
  .limit(1)
  .single();

if (storedError) {
  console.log('Error fetching embedding:', storedError);
  process.exit(1);
}

console.log('Got embedding for moment:', stored.moment_id);
const embeddingStr = typeof stored.embedding === 'string'
  ? stored.embedding
  : JSON.stringify(stored.embedding);
console.log('Embedding type from client:', typeof stored.embedding);
console.log('Embedding length:', embeddingStr.length);
console.log('Preview:', embeddingStr.substring(0, 80));

// Test 1: RPC with stored embedding string
console.log('\n--- Test 1: supabase.rpc() with stored embedding string ---');
const { data: rpcResult1, error: rpcError1 } = await supabase.rpc(
  'debug_search_test',
  {
    query_embedding: embeddingStr,
    match_threshold: 0.0
  }
);
console.log('Error:', rpcError1?.message || 'none');
console.log('Result count:', rpcResult1?.length ?? 'null');
if (rpcResult1?.length > 0) {
  console.log('First result:', JSON.stringify(rpcResult1[0], null, 2));
}

// Parse to array and re-format (like API does with Replicate output)
const parsedArray = JSON.parse(embeddingStr);
const reformatted = `[${parsedArray.join(',')}]`;

console.log('\n--- Test 2: supabase.rpc() with reformatted embedding ---');
const { data: rpcResult2, error: rpcError2 } = await supabase.rpc(
  'debug_search_test',
  {
    query_embedding: reformatted,
    match_threshold: 0.0
  }
);
console.log('Error:', rpcError2?.message || 'none');
console.log('Result count:', rpcResult2?.length ?? 'null');
if (rpcResult2?.length > 0) {
  console.log('First result:', JSON.stringify(rpcResult2[0], null, 2));
}

// Test 3: Direct REST API call for comparison
console.log('\n--- Test 3: Direct REST API with same embedding ---');
const res = await fetch(url + '/rest/v1/rpc/debug_search_test', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query_embedding: reformatted,
    match_threshold: 0.0
  })
});
const data3 = await res.json();
console.log('Status:', res.status);
console.log('Result count:', data3?.length ?? 'error');
if (data3?.length > 0) {
  console.log('First result:', JSON.stringify(data3[0], null, 2));
}

// Test 4: search_moments_by_embedding via Supabase client
console.log('\n--- Test 4: supabase.rpc() search_moments_by_embedding ---');
const { data: rpcResult4, error: rpcError4 } = await supabase.rpc(
  'search_moments_by_embedding',
  {
    query_embedding: reformatted,
    match_threshold: 0.0,
    match_count: 5
  }
);
console.log('Error:', rpcError4?.message || 'none');
console.log('Result count:', rpcResult4?.length ?? 'null');
if (rpcResult4?.length > 0) {
  console.log('First 2 results:', JSON.stringify(rpcResult4.slice(0, 2), null, 2));
}
