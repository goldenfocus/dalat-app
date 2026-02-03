import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const url = envFile.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)?.[1];
const key = envFile.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1];

if (!url || !key) { console.log('Missing env vars'); process.exit(1); }

// Get stored embedding
const getEmbedding = await fetch(url + '/rest/v1/moment_embeddings?select=moment_id,embedding&limit=1', {
  method: 'GET',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
  }
});
const embeddingData = await getEmbedding.json();
const storedEmbeddingString = embeddingData[0].embedding;

console.log('Original stored embedding (direct from DB):');
console.log('  Type:', typeof storedEmbeddingString);
console.log('  Length:', storedEmbeddingString.length);
console.log('  Preview:', storedEmbeddingString.substring(0, 80));

// Parse and re-stringify (this is what happens in the API)
const asArray = JSON.parse(storedEmbeddingString);
console.log('\nParsed to array:');
console.log('  Array length:', asArray.length);
console.log('  First 5 values:', asArray.slice(0, 5));

// Re-format using join (this is what the API does with text embeddings)
const reformatted = `[${asArray.join(',')}]`;
console.log('\nReformatted via join:');
console.log('  Length:', reformatted.length);
console.log('  Preview:', reformatted.substring(0, 80));

// Check if they're identical
console.log('\nAre strings identical?', storedEmbeddingString === reformatted);

// Test 1: Original string (direct from DB)
console.log('\n--- Test 1: Original string from DB ---');
const res1 = await fetch(url + '/rest/v1/rpc/debug_search_test', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query_embedding: storedEmbeddingString,
    match_threshold: 0.0
  })
});
const data1 = await res1.json();
console.log('Status:', res1.status);
console.log('Result count:', Array.isArray(data1) ? data1.length : 'error');
if (data1.length > 0) {
  console.log('First result:', JSON.stringify(data1[0], null, 2));
}

// Test 2: Reformatted string (simulating API behavior)
console.log('\n--- Test 2: Reformatted string (API-style) ---');
const res2 = await fetch(url + '/rest/v1/rpc/debug_search_test', {
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
const data2 = await res2.json();
console.log('Status:', res2.status);
console.log('Result count:', Array.isArray(data2) ? data2.length : 'error');
if (data2.length > 0) {
  console.log('First result:', JSON.stringify(data2[0], null, 2));
}

// Test 3: Check numeric precision differences
const originalFirst = storedEmbeddingString.match(/^\[([^,]+),/)?.[1];
const reformattedFirst = reformatted.match(/^\[([^,]+),/)?.[1];
console.log('\n--- Numeric precision comparison ---');
console.log('Original first value:', originalFirst);
console.log('Reformatted first value:', reformattedFirst);
console.log('Are they equal?', originalFirst === reformattedFirst);
