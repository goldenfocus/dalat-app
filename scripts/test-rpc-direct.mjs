import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const url = envFile.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/)?.[1];
const key = envFile.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1];

if (!url || !key) { console.log('Missing env vars'); process.exit(1); }

console.log('URL:', url);
console.log('Key length:', key.length);

// First, get a stored embedding
const getEmbedding = await fetch(url + '/rest/v1/moment_embeddings?select=moment_id,embedding&limit=1', {
  method: 'GET',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
  }
});
const embeddingData = await getEmbedding.json();
console.log('Fetched embedding response status:', getEmbedding.status);

if (getEmbedding.status !== 200 || !embeddingData.length) {
  console.log('Error fetching embedding:', embeddingData);
  process.exit(1);
}

const storedEmbedding = embeddingData[0].embedding;
console.log('Stored embedding type:', typeof storedEmbedding);
console.log('Stored embedding is array:', Array.isArray(storedEmbedding));
console.log('Stored embedding length:', storedEmbedding?.length);
console.log('First 5:', storedEmbedding?.slice?.(0, 5));

// Format as string for pgvector if it's an array
let embeddingString;
if (Array.isArray(storedEmbedding)) {
  embeddingString = `[${storedEmbedding.join(',')}]`;
} else if (typeof storedEmbedding === 'string') {
  embeddingString = storedEmbedding;
}
console.log('Embedding string preview:', embeddingString?.substring(0, 100));

// Test debug_embedding_moments
const res1 = await fetch(url + '/rest/v1/rpc/debug_embedding_moments', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
});
console.log('\ndebug_embedding_moments status:', res1.status);
const data1 = await res1.json();
console.log('debug_embedding_moments result:', JSON.stringify(data1, null, 2));

// Test debug_search_test with stored embedding
const res2 = await fetch(url + '/rest/v1/rpc/debug_search_test', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query_embedding: embeddingString,
    match_threshold: 0.0
  })
});
console.log('\ndebug_search_test status:', res2.status);
const data2 = await res2.json();
console.log('debug_search_test result:', JSON.stringify(data2, null, 2));

// Test search_moments_by_embedding with stored embedding
const res3 = await fetch(url + '/rest/v1/rpc/search_moments_by_embedding', {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query_embedding: embeddingString,
    match_threshold: 0.0,
    match_count: 5
  })
});
console.log('\nsearch_moments_by_embedding status:', res3.status);
const data3 = await res3.json();
console.log('search_moments_by_embedding result:', JSON.stringify(data3, null, 2));
