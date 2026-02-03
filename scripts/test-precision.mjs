import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const url = envFile.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)?.[1];
const key = envFile.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1];

if (!url || !key) { console.log('Missing env vars'); process.exit(1); }

// Simulated Replicate output (high precision numbers like what they return)
// First 5 values from production debug: 0.3348899781703949, 0.38817495107650757, 0.215423583984375, -0.3565171957015991, 0.18841663002967834
// I'll create a full 768-dim vector with similar precision

// Get stored embedding for reference
const getEmbedding = await fetch(url + '/rest/v1/moment_embeddings?select=moment_id,embedding&limit=1', {
  method: 'GET',
  headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
});
const embeddingData = await getEmbedding.json();
const storedArray = JSON.parse(embeddingData[0].embedding);

// Convert to high precision (simulating Replicate's output format)
// JavaScript's toString() gives full precision
const highPrecisionArray = storedArray.map(v => {
  // Multiply by a small factor and add tiny noise to get longer decimals
  return v * 1.00000001 + 0.00000001;
});

console.log('Original precision (stored):');
console.log('  First 5:', storedArray.slice(0, 5));
console.log('  As string:', `[${storedArray.slice(0,3).join(',')}...]`);

console.log('\nHigh precision (simulated Replicate):');
console.log('  First 5:', highPrecisionArray.slice(0, 5));
console.log('  As string:', `[${highPrecisionArray.slice(0,3).join(',')}...]`);

// Format like API does
const lowPrecString = `[${storedArray.join(',')}]`;
const highPrecString = `[${highPrecisionArray.join(',')}]`;

console.log('\nString lengths:');
console.log('  Low precision:', lowPrecString.length);
console.log('  High precision:', highPrecString.length);

// Test low precision
console.log('\n--- Testing LOW precision embedding ---');
const res1 = await fetch(url + '/rest/v1/rpc/debug_search_test', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query_embedding: lowPrecString,
    match_threshold: 0.0
  })
});
console.log('Status:', res1.status);
const data1 = await res1.json();
console.log('Result count:', Array.isArray(data1) ? data1.length : 'error');
if (data1.length > 0) console.log('First similarity:', data1[0].computed_similarity);

// Test high precision
console.log('\n--- Testing HIGH precision embedding ---');
const res2 = await fetch(url + '/rest/v1/rpc/debug_search_test', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query_embedding: highPrecString,
    match_threshold: 0.0
  })
});
console.log('Status:', res2.status);
const data2 = await res2.json();
console.log('Result count:', Array.isArray(data2) ? data2.length : 'error');
if (Array.isArray(data2)) {
  if (data2.length > 0) console.log('First similarity:', data2[0].computed_similarity);
  else console.log('Empty result');
} else {
  console.log('Error:', JSON.stringify(data2));
}

// Test with actual Replicate-style numbers (from production debug)
const replicateStyleFirst5 = [
  0.3348899781703949,
  0.38817495107650757,
  0.215423583984375,
  -0.3565171957015991,
  0.18841663002967834
];

// Create a full 768-dim vector mixing Replicate-style precision
const replicateStyle = storedArray.map((v, i) => {
  if (i < 5) return replicateStyleFirst5[i];
  // Generate similar high-precision numbers for rest
  return v + (Math.random() - 0.5) * 0.001;
});
const replicateString = `[${replicateStyle.join(',')}]`;

console.log('\n--- Testing REPLICATE-style precision embedding ---');
console.log('First value:', replicateStyle[0]);
console.log('String length:', replicateString.length);
const res3 = await fetch(url + '/rest/v1/rpc/debug_search_test', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query_embedding: replicateString,
    match_threshold: 0.0
  })
});
console.log('Status:', res3.status);
const data3 = await res3.json();
console.log('Result count:', Array.isArray(data3) ? data3.length : 'error');
if (Array.isArray(data3) && data3.length > 0) {
  console.log('First result:', JSON.stringify(data3[0], null, 2));
}
