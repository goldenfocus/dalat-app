import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCoverImage, refineCoverImage } from "@/lib/blog/cover-generator";

const RATE_LIMIT = 10; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: Request) {
  try {
    // Verify user is admin
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
      p_action: 'blog_generate_cover',
      p_limit: RATE_LIMIT,
      p_window_ms: RATE_WINDOW_MS,
    });

    if (rateError) {
      console.error("[blog/generate-cover] Rate limit check failed:", rateError);
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

    // Get inputs
    const body = await request.json();
    const { title, content, category, existingImageUrl, refinementPrompt, customPrompt } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Generate slug from title for file naming
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);

    let imageUrl: string;

    // Refinement mode: edit existing image
    if (existingImageUrl && refinementPrompt) {
      imageUrl = await refineCoverImage(slug, existingImageUrl, refinementPrompt);
    } else {
      // Use custom prompt if provided, otherwise build default
      const prompt =
        customPrompt ||
        `Create an abstract, artistic cover image for a blog post about: ${title}

Context: ${content?.slice(0, 200) || "A blog post about technology and community events"}
Category: ${category || "general"}

Style guidelines:
- Modern, clean, tech-forward aesthetic
- Purple and blue gradient background inspired by dalat.app branding
- Abstract geometric shapes or flowing lines relevant to the topic
- Subtle visual elements that hint at the subject matter
- Atmospheric depth with soft glow effects
- NO text, NO lettering, NO words
- Landscape orientation (16:9 aspect ratio)
- Professional and polished feel`;

      imageUrl = await generateCoverImage(slug, prompt);
    }

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("[blog/generate-cover] Error:", error);
    return NextResponse.json(
      { error: "Cover generation failed" },
      { status: 500 }
    );
  }
}
