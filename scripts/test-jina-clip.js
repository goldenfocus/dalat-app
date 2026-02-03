const Replicate = require("replicate");

// Alternative models
const JINA_CLIP = "zsxkib/jina-clip-v2:fbb95a76d43c0a9a50ed46151f23ab40d87ce7a6e9a7e92dcc3f4c9ad8c8b66c";

const images = [
  "https://cdn.dalat.app/moments/f5103aa8-ef16-4890-ab5e-df2588a3cbaa/303f96f6-0501-465c-9ee5-96e6136bb8bb/1768205558586.jpg",
  "https://cdn.dalat.app/moments/ce710146-af01-4f46-be61-33e33f60564a/303f96f6-0501-465c-9ee5-96e6136bb8bb/1768781302909_kdz6q1.jpg",
];

async function main() {
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  console.log("Testing Jina CLIP v2 model...\n");

  for (const imageUrl of images) {
    console.log("=== Image:", imageUrl.split("/").pop(), "===");
    try {
      const output = await replicate.run(JINA_CLIP, {
        input: { image: imageUrl },
      });

      console.log("Output type:", typeof output, Array.isArray(output) ? `array[${output.length}]` : "");

      if (Array.isArray(output) && output.length > 0) {
        const embedding = typeof output[0] === "number" ? output : output[0];
        if (Array.isArray(embedding)) {
          console.log("Embedding length:", embedding.length);
          console.log("First 5:", embedding.slice(0, 5).map(v => v.toFixed(4)));
          console.log("Sum:", embedding.reduce((a, b) => a + b, 0).toFixed(4));
        } else if (embedding?.embedding) {
          console.log("Embedding length:", embedding.embedding.length);
          console.log("First 5:", embedding.embedding.slice(0, 5).map(v => v.toFixed(4)));
        } else {
          console.log("Raw:", JSON.stringify(output).slice(0, 300));
        }
      } else {
        console.log("Unexpected output:", JSON.stringify(output).slice(0, 300));
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
      const output = await replicate.run(JINA_CLIP, {
        input: { text: text },
      });
      if (Array.isArray(output) && output.length > 0) {
        const embedding = typeof output[0] === "number" ? output : output[0];
        if (Array.isArray(embedding)) {
          console.log(`"${text}" first 5:`, embedding.slice(0, 5).map(v => v.toFixed(4)));
        }
      }
    } catch (err) {
      console.error(`Error for "${text}":`, err.message);
    }
  }
}

main().catch(console.error);
