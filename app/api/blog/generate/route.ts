import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  CHAT_BLOG_SYSTEM,
  buildChatBlogPrompt,
  type ChatBlogInput,
  type ChatBlogOutput,
} from "@/lib/blog/chat-blog-prompt";

const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: Request) {
  try {
    // Verify user is admin
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, can_blog")
      .eq("id", user.id)
      .single();

    // Check blog permission: admin/superadmin role OR can_blog flag
    const canBlog =
      profile?.role === "admin" ||
      profile?.role === "superadmin" ||
      profile?.can_blog === true;

    if (!profile || !canBlog) {
      return NextResponse.json({ error: "Blog access required" }, { status: 403 });
    }

    // Database-backed rate limiting
    const { data: rateCheck, error: rateError } = await supabase.rpc('check_rate_limit', {
      p_action: 'blog_generate',
      p_limit: RATE_LIMIT,
      p_window_ms: RATE_WINDOW_MS,
    });

    if (rateError) {
      console.error("[blog/generate] Rate limit check failed:", rateError);
    } else if (!rateCheck?.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Try again later.",
          remaining: 0,
          reset_at: rateCheck?.reset_at,
        },
        { status: 429 }
      );
    }

    // Parse input
    const body = await request.json();
    const { userInput, category, previousContext } = body as ChatBlogInput;

    if (!userInput?.trim()) {
      return NextResponse.json({ error: "Input is required" }, { status: 400 });
    }

    // Generate with Claude
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: CHAT_BLOG_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildChatBlogPrompt({ userInput, category, previousContext }),
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Parse JSON response
    let jsonText = textContent.text.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);

    const result = JSON.parse(jsonText.trim()) as ChatBlogOutput;

    return NextResponse.json(result);
  } catch (error) {
    console.error("[blog/generate] Error:", error);
    return NextResponse.json(
      { error: "Generation failed" },
      { status: 500 }
    );
  }
}
