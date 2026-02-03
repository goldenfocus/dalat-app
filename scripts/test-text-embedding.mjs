import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const url = envFile.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)?.[1];
const key = envFile.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1];

if (!url || !key) { console.log('Missing env vars'); process.exit(1); }

// First, get a stored embedding
const getEmbedding = await fetch(url + '/rest/v1/moment_embeddings?select=moment_id,embedding&limit=1', {
  method: 'GET',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
  }
});
const embeddingData = await getEmbedding.json();
const storedEmbeddingString = embeddingData[0].embedding;

// Parse the stored embedding to an array
const storedArray = JSON.parse(storedEmbeddingString);
console.log('Stored embedding array length:', storedArray.length);

// Create a "fake text embedding" by adding small noise (simulating text-to-image difference)
// This mimics what happens when we generate a text embedding from Replicate
const fakeTextEmbedding = storedArray.map((v, i) => {
  // Add noise to make it different, simulating ~0.15 cosine similarity
  const noise = (Math.random() - 0.5) * 2;  // -1 to 1
  return v + noise;
});

// Format like JavaScript would (high precision)
const highPrecisionString = `[${fakeTextEmbedding.join(',')}]`;
console.log('High precision string preview:', highPrecisionString.substring(0, 120));
console.log('High precision string length:', highPrecisionString.length);

// Format like PostgreSQL returns (lower precision)
const lowPrecisionString = `[${fakeTextEmbedding.map(v => v.toFixed(8)).join(',')}]`;
console.log('Low precision string preview:', lowPrecisionString.substring(0, 120));
console.log('Low precision string length:', lowPrecisionString.length);

// Test 1: High precision embedding
console.log('\n--- Testing HIGH precision text embedding ---');
const res1 = await fetch(url + '/rest/v1/rpc/debug_search_test', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query_embedding: highPrecisionString,
    match_threshold: 0.0
  })
});
console.log('Status:', res1.status);
const data1 = await res1.json();
console.log('Result:', JSON.stringify(data1?.slice?.(0, 3) || data1, null, 2));

// Test 2: Low precision embedding (like stored)
console.log('\n--- Testing LOW precision text embedding ---');
const res2 = await fetch(url + '/rest/v1/rpc/debug_search_test', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query_embedding: lowPrecisionString,
    match_threshold: 0.0
  })
});
console.log('Status:', res2.status);
const data2 = await res2.json();
console.log('Result:', JSON.stringify(data2?.slice?.(0, 3) || data2, null, 2));

// Test 3: Using Supabase JS client style (what the production API does)
console.log('\n--- Testing via Supabase JS client (simulated) ---');
// The Supabase JS client POSTs the body differently - it uses Prefer header for RPC
const res3 = await fetch(url + '/rest/v1/rpc/debug_search_test', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'  // This is what Supabase JS adds
  },
  body: JSON.stringify({
    query_embedding: highPrecisionString,
    match_threshold: 0.0
  })
});
console.log('Status:', res3.status);
const data3 = await res3.json();
console.log('Result:', JSON.stringify(data3?.slice?.(0, 3) || data3, null, 2));
