import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { text, context } = await request.json();

    if (!text?.trim()) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    const client = new Anthropic();

    const systemPrompt = `You are a helpful writing assistant. Improve the user's text to be more clear, engaging, and well-written while preserving their original meaning and intent.

Guidelines:
- Keep the same tone and style (casual/formal)
- Fix grammar and spelling
- Make it more concise if verbose
- Make it more engaging if bland
- Preserve any important details
- Keep similar length (don't over-expand)
- Support Vietnamese and English text
- Return ONLY the improved text, no explanations`;

    const userPrompt = context
      ? `Context: This is ${context}\n\nText to improve:\n${text}`
      : `Text to improve:\n${text}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    return NextResponse.json({ enhanced: textContent.text.trim() });
  } catch (error) {
    console.error("Text enhancement error:", error);

    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        return NextResponse.json(
          { error: "AI service configuration error" },
          { status: 503 }
        );
      }
      if (error.message.includes("rate") || error.message.includes("limit")) {
        return NextResponse.json(
          { error: "AI service busy. Try again in a moment." },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to enhance text" },
      { status: 500 }
    );
  }
}
