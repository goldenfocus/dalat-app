const Replicate = require("replicate");

const CLIP_MODEL = "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a";

async function testEmbeddings() {
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  const images = [
    "https://cdn.dalat.app/moments/f5103aa8-ef16-4890-ab5e-df2588a3cbaa/303f96f6-0501-465c-9ee5-96e6136bb8bb/1768205558586.jpg",
    "https://cdn.dalat.app/moments/ce710146-af01-4f46-be61-33e33f60564a/303f96f6-0501-465c-9ee5-96e6136bb8bb/1768781302909_kdz6q1.jpg"
  ];

  for (const imageUrl of images) {
    console.log("\n=== Testing image:", imageUrl.split("/").pop(), "===");

    const output = await replicate.run(CLIP_MODEL, {
      input: { image: imageUrl },
    });

    console.log("Raw output type:", typeof output, Array.isArray(output) ? "isArray" : "notArray");
    console.log("Raw output length:", Array.isArray(output) ? output.length : "N/A");

    if (Array.isArray(output) && output.length > 0) {
      const first = output[0];
      console.log("First element type:", typeof first);

      if (first?.embedding) {
        console.log("Embedding length:", first.embedding.length);
        console.log("First 5 values:", first.embedding.slice(0, 5));
        console.log("Sum:", first.embedding.reduce((a, b) => a + b, 0).toFixed(4));
      } else {
        console.log("No embedding property, raw first 5:", output.slice(0, 5));
      }
    }
  }
}

testEmbeddings().catch(console.error);
