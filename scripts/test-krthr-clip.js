const Replicate = require("replicate");

// Alternative CLIP model
const CLIP_MODEL = "krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4";

const images = [
  "https://cdn.dalat.app/moments/f5103aa8-ef16-4890-ab5e-df2588a3cbaa/303f96f6-0501-465c-9ee5-96e6136bb8bb/1768205558586.jpg",
  "https://cdn.dalat.app/moments/ce710146-af01-4f46-be61-33e33f60564a/303f96f6-0501-465c-9ee5-96e6136bb8bb/1768781302909_kdz6q1.jpg",
];

async function main() {
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  console.log("Testing krthr/clip-embeddings model...\n");

  for (const imageUrl of images) {
    console.log("=== Image:", imageUrl.split("/").pop(), "===");
    try {
      const output = await replicate.run(CLIP_MODEL, {
        input: { image: imageUrl },
      });

      console.log("Output type:", typeof output, Array.isArray(output) ? `array[${output.length}]` : "");

      // Handle different output formats
      let embedding;
      if (Array.isArray(output) && typeof output[0] === "number") {
        embedding = output;
      } else if (Array.isArray(output) && output[0]?.embedding) {
        embedding = output[0].embedding;
      } else if (output?.embedding) {
        embedding = output.embedding;
      }

      if (embedding && Array.isArray(embedding)) {
        console.log("Embedding length:", embedding.length);
        console.log("First 5:", embedding.slice(0, 5).map(v => v.toFixed(4)));
        console.log("Sum:", embedding.reduce((a, b) => a + b, 0).toFixed(4));
      } else {
        console.log("Raw output:", JSON.stringify(output).slice(0, 300));
      }
    } catch (err) {
      console.error("Error:", err.message);
    }
    console.log();
  }

  // Also test text
  console.log("=== Testing text embeddings ===");
  for (const text of ["a dog", "a car"]) {
    try {
      const output = await replicate.run(CLIP_MODEL, {
        input: { text: text },
      });
      let embedding;
      if (Array.isArray(output) && typeof output[0] === "number") {
        embedding = output;
      } else if (Array.isArray(output) && output[0]?.embedding) {
        embedding = output[0].embedding;
      }
      if (embedding) {
        console.log(`"${text}" first 5:`, embedding.slice(0, 5).map(v => v.toFixed(4)));
      }
    } catch (err) {
      console.error(`Error for "${text}":`, err.message);
    }
  }
}

main().catch(console.error);
