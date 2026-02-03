const Replicate = require("replicate");

// Try different CLIP models
const MODELS = [
  // Original model
  "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
  // Alternative models
  "daanelson/imagebind:0383f62e173dc821ec52663ed22a076d9c970549c209f44c6e3e11cdba99b6dc",
];

const images = [
  "https://cdn.dalat.app/moments/f5103aa8-ef16-4890-ab5e-df2588a3cbaa/303f96f6-0501-465c-9ee5-96e6136bb8bb/1768205558586.jpg",
  "https://cdn.dalat.app/moments/ce710146-af01-4f46-be61-33e33f60564a/303f96f6-0501-465c-9ee5-96e6136bb8bb/1768781302909_kdz6q1.jpg"
];

async function testModel(replicate, modelVersion, imageUrl) {
  try {
    const output = await replicate.run(modelVersion, {
      input: { image: imageUrl },
    });

    if (Array.isArray(output) && output.length > 0) {
      const embedding = output[0]?.embedding || output;
      if (Array.isArray(embedding)) {
        return {
          success: true,
          length: embedding.length,
          first5: embedding.slice(0, 5),
          sum: embedding.reduce((a, b) => a + b, 0).toFixed(4),
        };
      }
    }
    return { success: true, raw: JSON.stringify(output).slice(0, 200) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function main() {
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  // Test with original model - try text input
  console.log("\n=== Testing with TEXT input (should work) ===");
  try {
    const textOutput = await replicate.run(MODELS[0], {
      input: { text: "a photo of a dog" },
    });
    if (Array.isArray(textOutput) && textOutput.length > 0) {
      const embedding = textOutput[0]?.embedding;
      if (embedding) {
        console.log("Text embedding first 5:", embedding.slice(0, 5));
        console.log("Text embedding sum:", embedding.reduce((a, b) => a + b, 0).toFixed(4));
      }
    }
  } catch (err) {
    console.error("Text test error:", err.message);
  }

  // Test different images with text too
  console.log("\n=== Testing text for 'dog' vs 'car' ===");
  for (const text of ["a photo of a dog", "a photo of a car"]) {
    try {
      const output = await replicate.run(MODELS[0], {
        input: { text },
      });
      if (Array.isArray(output) && output.length > 0 && output[0]?.embedding) {
        console.log(`"${text}" first 5:`, output[0].embedding.slice(0, 5).map(v => v.toFixed(4)));
      }
    } catch (err) {
      console.error("Error:", err.message);
    }
  }
}

main().catch(console.error);
