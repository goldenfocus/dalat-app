import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { title, customPrompt } = await request.json();

    if (!title?.trim() && !customPrompt?.trim()) {
      return NextResponse.json(
        { error: "Event title or custom prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI generation is not configured" },
        { status: 503 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Use Gemini to generate the image
    // Note: As of early 2025, Imagen 3 is available through the Gemini API
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp-image-generation",
    });

    // Use custom prompt if provided, otherwise generate default
    const prompt = customPrompt?.trim() || `Create a vibrant, eye-catching event poster background for "${title}".

Style: Modern event flyer aesthetic with warm Vietnamese highland colors.
Setting: Inspired by Da Lat, Vietnam - misty mountains, pine forests, French colonial architecture, flower fields.
Mood: Atmospheric, inviting, energetic yet sophisticated.
Important: Do NOT include any text or lettering in the image. Create only the visual background.
Aspect ratio: 2:1 landscape orientation.`;

    console.log("[generate-flyer] Calling Gemini with prompt:", prompt.slice(0, 100) + "...");

    const result = await model.generateContent(prompt);
    const response = result.response;

    // Debug: Log full response structure
    console.log("[generate-flyer] Response candidates:", JSON.stringify({
      candidatesCount: response.candidates?.length ?? 0,
      finishReason: response.candidates?.[0]?.finishReason,
      partsCount: response.candidates?.[0]?.content?.parts?.length ?? 0,
      partTypes: response.candidates?.[0]?.content?.parts?.map(p =>
        "inlineData" in p ? `inline:${p.inlineData?.mimeType}` :
        "text" in p ? "text" :
        Object.keys(p).join(",")
      ),
    }, null, 2));

    // Extract the image from the response
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      console.error("[generate-flyer] No parts in response. Full response:", JSON.stringify(response, null, 2));
      throw new Error("No response from AI model");
    }

    // Find the image part in the response
    const imagePart = parts.find(
      (part) => "inlineData" in part && part.inlineData?.mimeType?.startsWith("image/")
    );

    if (!imagePart || !("inlineData" in imagePart)) {
      console.error("[generate-flyer] No image part found. Parts:", JSON.stringify(parts.map(p =>
        "inlineData" in p ? { type: "inlineData", mime: p.inlineData?.mimeType } :
        "text" in p ? { type: "text", preview: (p.text as string)?.slice(0, 100) } :
        { type: "unknown", keys: Object.keys(p) }
      ), null, 2));
      throw new Error("No image generated");
    }

    console.log("[generate-flyer] Successfully generated image:", imagePart.inlineData!.mimeType);

    const base64Data = imagePart.inlineData!.data;
    const mimeType = imagePart.inlineData!.mimeType;

    // Return as data URL for immediate preview
    const imageUrl = `data:${mimeType};base64,${base64Data}`;

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("Flyer generation error:", error);

    // Handle specific API errors
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        return NextResponse.json(
          { error: "AI service configuration error" },
          { status: 503 }
        );
      }
      if (error.message.includes("quota") || error.message.includes("limit")) {
        return NextResponse.json(
          { error: "AI generation limit reached. Try again later." },
          { status: 429 }
        );
      }
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate flyer image: ${errorMessage}` },
      { status: 500 }
    );
  }
}
