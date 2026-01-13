import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { title } = await request.json();

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "Event title is required" },
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

    // TODO: Craft your ideal prompt for Da Lat event flyers
    // This is where you can customize the aesthetic!
    const prompt = `Create a vibrant, eye-catching event poster background for "${title}".

Style: Modern event flyer aesthetic with warm Vietnamese highland colors.
Setting: Inspired by Da Lat, Vietnam - misty mountains, pine forests, French colonial architecture, flower fields.
Mood: Atmospheric, inviting, energetic yet sophisticated.
Important: Do NOT include any text or lettering in the image. Create only the visual background.
Aspect ratio: 2:1 landscape orientation.`;

    const result = await model.generateContent(prompt);
    const response = result.response;

    // Extract the image from the response
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      throw new Error("No response from AI model");
    }

    // Find the image part in the response
    const imagePart = parts.find(
      (part) => "inlineData" in part && part.inlineData?.mimeType?.startsWith("image/")
    );

    if (!imagePart || !("inlineData" in imagePart)) {
      throw new Error("No image generated");
    }

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

    return NextResponse.json(
      { error: "Failed to generate flyer image" },
      { status: 500 }
    );
  }
}
