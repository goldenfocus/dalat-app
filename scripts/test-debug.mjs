import fs from 'fs';
import Replicate from 'replicate';

const envFile = fs.readFileSync('.env.local', 'utf8');
const url = envFile.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)?.[1];
const key = envFile.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1];
const replicateToken = envFile.match(/REPLICATE_API_TOKEN="([^"]+)"/)?.[1];

if (!url || !key || !replicateToken) { console.log('Missing env vars'); process.exit(1); }

// Generate text embedding
console.log('Generating text embedding for "people"...');
const replicate = new Replicate({ auth: replicateToken });
const rawOutput = await replicate.run('krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4', {
  input: { text: 'people' }
});

let textEmbedding;
if (rawOutput?.embedding) {
  textEmbedding = rawOutput.embedding;
}
console.log('Text embedding length:', textEmbedding?.length);
console.log('Text embedding first 5:', textEmbedding?.slice(0, 5));

// Format as string for pgvector
const textEmbeddingString = `[${textEmbedding.join(',')}]`;
console.log('Embedding string preview:', textEmbeddingString.substring(0, 100));

// Test debug_search_test with text embedding
const res = await fetch(url + '/rest/v1/rpc/debug_search_test', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query_embedding: textEmbeddingString,
    match_threshold: 0.0
  })
});
const data = await res.json();
console.log('debug_search_test with TEXT embedding:', JSON.stringify(data, null, 2));

// Also test the main search function
const res2 = await fetch(url + '/rest/v1/rpc/search_moments_by_embedding', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query_embedding: textEmbeddingString,
    match_threshold: 0.0,
    match_count: 5
  })
});
const data2 = await res2.json();
console.log('search_moments_by_embedding with TEXT embedding:', JSON.stringify(data2, null, 2));
