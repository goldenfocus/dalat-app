# Blog Admin System - Complete Implementation Spec

## Executive Summary

Build a two-lane blog publishing system for dalat.app:
- **Lane A**: Automated daily changelog (scheduled, reduces commit noise)
- **Lane B**: Human blogging (conversation-first, voice-enabled)

**Core Principle**: Automation for reflection, humans for expression.

---

## Context: What Already Exists

### Database (Already Deployed)
```sql
-- Tables exist in production:
blog_posts (
  id, slug, title, story_content, technical_content,
  cover_image_url, source, status, category_id,
  version, seo_keywords[], meta_description,
  suggested_cta_url, suggested_cta_text,
  published_at, created_at, updated_at
)

blog_categories (id, slug, name, description, sort_order)
-- Seeded: 'changelog', 'stories', 'guides'

blog_post_likes (id, post_id, user_id, created_at)
```

### Existing Files (Do Not Recreate)
```
lib/blog/content-generator.ts     # Claude dual content generation
lib/blog/cover-generator.ts       # Gemini 2.0 cover images
lib/blog/rss.ts                   # RSS feed
lib/types/blog.ts                 # TypeScript types

app/[locale]/blog/page.tsx                    # Public blog list
app/[locale]/blog/[category]/[slug]/page.tsx  # Public post view
app/api/webhooks/github-release/route.ts      # GitHub webhook
app/api/blog/raw/[slug]/route.ts              # Machine-readable JSON
app/blog/rss.xml/route.ts                     # RSS endpoint

components/blog/                   # All blog UI components exist
```

### Patterns to Follow
```
# Admin page pattern:
app/[locale]/admin/festivals/page.tsx    # Copy this structure
components/admin/festival-form.tsx       # Form pattern

# Voice recording reference (external):
~/vibelog/components/mic/               # MediaRecorder patterns

# AI text enhancement:
components/ui/ai-enhance-textarea.tsx   # Already integrated

# Admin auth pattern:
app/[locale]/admin/layout.tsx           # Role checking
```

---

## Architecture: Two Lanes

### Lane A: Automated Daily Changelog

```
GitHub Pushes (throughout day)
         ↓
   (commits accumulate)
         ↓
Daily @ midnight UTC (Vercel Cron)
         ↓
/api/cron/daily-summary
         ↓
Fetch 24h commits via GitHub API
         ↓
Classify: user-visible | behavior-change | refactor | experiment
         ↓
Group by area: Events, Moments, Auth, Blog, Admin
         ↓
AI generates ONE summary post
         ↓
Create as DRAFT (source='daily_summary')
         ↓
Admin reviews in /admin/blog → Publish
```

**Key Rules:**
1. ALWAYS generate `technical_content` (structured log)
2. ONLY generate `story_content` if meaningful user-visible work
3. Be honest about uncertainty - unclear commits = say so
4. Mark incomplete/experimental work explicitly
5. Default to DRAFT status

### Lane B: Human-Initiated Blogging

```
/admin/blog/new opens:

┌─────────────────────────────────────────────┐
│                                             │
│  "Hey — what do you want to blog about?"   │
│                                             │
│  [🎤 Voice]  [Type your thoughts...]        │
│                                             │
│  Category: [optional dropdown]              │
│                                             │
└─────────────────────────────────────────────┘

User speaks or types freely
         ↓
AI infers intent and audience
         ↓
At most ONE clarifying question (if unclear)
         ↓
Generates: story_content + technical_content + metadata
         ↓
Preview (side-by-side) → Edit → Publish
```

**Key Rules:**
1. Conversation-first, NOT form-first
2. Voice button always prominent
3. AI asks max ONE clarifying question
4. Fast, low-friction, non-technical for human bloggers

---

## Schema Changes Required

```sql
-- Migration: 20260119_001_blog_two_lanes.sql

-- 1. Enhanced lifecycle status
ALTER TABLE blog_posts DROP CONSTRAINT IF EXISTS blog_posts_status_check;
ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_status_check
CHECK (status IN ('draft', 'experimental', 'published', 'deprecated', 'archived'));

-- 2. Add daily_summary source type
ALTER TABLE blog_posts DROP CONSTRAINT IF EXISTS blog_posts_source_check;
ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_source_check
CHECK (source IN ('github_release', 'manual', 'daily_summary'));

-- 3. Daily summary metadata
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS summary_date date;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS areas_changed text[];

-- 4. Admin function: list all posts (including drafts)
CREATE OR REPLACE FUNCTION admin_get_blog_posts(
  p_status text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  story_content text,
  cover_image_url text,
  source text,
  status text,
  version text,
  summary_date date,
  areas_changed text[],
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  category_slug text,
  category_name text,
  like_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    bp.id, bp.slug, bp.title, bp.story_content, bp.cover_image_url,
    bp.source, bp.status, bp.version, bp.summary_date, bp.areas_changed,
    bp.published_at, bp.created_at, bp.updated_at,
    bc.slug AS category_slug, bc.name AS category_name,
    (SELECT count(*) FROM blog_post_likes WHERE post_id = bp.id) AS like_count
  FROM blog_posts bp
  LEFT JOIN blog_categories bc ON bp.category_id = bc.id
  WHERE (p_status IS NULL OR bp.status = p_status)
    AND (p_source IS NULL OR bp.source = p_source)
  ORDER BY bp.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_blog_posts(text, text, int, int) TO authenticated;

-- 5. Admin function: delete/archive post
CREATE OR REPLACE FUNCTION admin_delete_blog_post(
  p_post_id uuid,
  p_hard_delete boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_hard_delete THEN
    DELETE FROM blog_posts WHERE id = p_post_id;
  ELSE
    UPDATE blog_posts SET status = 'archived', updated_at = now() WHERE id = p_post_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'post_id', p_post_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_blog_post(uuid, boolean) TO authenticated;
```

---

## Files to Create

### Phase 1: Foundation

```
supabase/migrations/20260119_001_blog_two_lanes.sql

app/[locale]/admin/blog/page.tsx              # Admin list view
components/admin/blog-post-row.tsx            # Row in list
```

### Phase 2: Edit Capability

```
app/[locale]/admin/blog/[id]/edit/page.tsx    # Edit form page
components/admin/blog-post-form.tsx           # Full edit form
app/api/blog/[id]/route.ts                    # GET/PATCH/DELETE
```

### Phase 3: Lane B - Chat-First Creation

```
app/[locale]/admin/blog/new/page.tsx          # Chat-first creation
components/admin/blog-chat-interface.tsx      # Conversation UI
components/admin/voice-recorder.tsx           # MediaRecorder + waveform
app/api/blog/transcribe/route.ts              # OpenAI Whisper
app/api/blog/generate/route.ts                # Claude for human input
lib/blog/chat-blog-prompt.ts                  # Prompt for human input
```

### Phase 4: Lane A - Daily Summaries

```
app/api/cron/daily-summary/route.ts           # Vercel cron endpoint
lib/blog/daily-summary-prompt.ts              # Prompt for changelog
```

### Files to Modify

```
app/[locale]/admin/layout.tsx                 # Add blog nav item
components/admin/admin-sidebar.tsx            # Add FileText icon
vercel.json                                   # Add cron config
```

---

## AI Prompts

### Daily Summary Prompt (Lane A)

```typescript
// lib/blog/daily-summary-prompt.ts

export const DAILY_SUMMARY_SYSTEM = `You are the chronicler for dalat.app.
Summarize today's development work for the team and community.

## Classification Rules (per commit)
- user-visible: Users will notice (new features, UI changes)
- behavior-change: Existing features work differently
- refactor: Internal only, no user impact
- experiment: WIP, may be reverted

## Output Rules
1. ALWAYS generate technical_content (structured markdown changelog)
2. ONLY generate story_content if meaningful user-visible work exists
3. Group changes by area: Events, Moments, Auth, Blog, Admin, Performance
4. Be honest about uncertainty - unclear commits = "unclear intent"
5. Mark incomplete/experimental work explicitly
6. Focus on WHY, not just WHAT

## Output Format (JSON)
{
  "has_meaningful_narrative": boolean,
  "story_content": "..." | null,
  "technical_content": "## Daily Changelog: Jan 18, 2026\\n\\n### Events\\n- ...\\n\\n### Blog\\n- ...",
  "title": "Daily Update: January 18, 2026",
  "areas_changed": ["Events", "Blog"],
  "one_line_summary": "Fixed search, improved mobile nav, experimenting with dark mode",
  "experiments": ["Dark mode toggle (WIP)"],
  "has_breaking_changes": false,
  "suggested_status": "draft"
}`;

export function buildDailySummaryPrompt(commits: Array<{ message: string; author: string; sha: string }>) {
  return `Summarize these commits from the last 24 hours:

${commits.map(c => `- ${c.message} (${c.author}, ${c.sha.slice(0, 7)})`).join('\n')}

Return valid JSON matching the output format.`;
}
```

### Chat Blog Prompt (Lane B)

```typescript
// lib/blog/chat-blog-prompt.ts

export const CHAT_BLOG_SYSTEM = `You are helping someone blog on dalat.app.
They shared raw thoughts (voice transcript or typed notes). Transform into polished content.

## Your Role
- Infer what they want to communicate
- Understand their audience
- Generate dual content: human story + technical details

## Response Strategy
1. If their input is clear enough → generate content directly
2. If unclear → ask ONE specific clarifying question, then wait for response
3. Never ask more than one question
4. Never ask generic questions like "tell me more"

## Output Format (when generating)
{
  "needs_clarification": false,
  "clarifying_question": null,
  "story_content": "...",           // 150-300 words, warm, human
  "technical_content": "...",       // Structured, if applicable
  "title": "...",
  "suggested_slug": "...",
  "meta_description": "...",        // 150 chars
  "seo_keywords": ["..."],
  "suggested_category": "stories" | "guides" | "changelog",
  "suggested_cta_url": "..." | null,
  "suggested_cta_text": "..."
}

## Output Format (when clarifying)
{
  "needs_clarification": true,
  "clarifying_question": "Is this about the new search feature or the navigation update?",
  ...rest null
}

## Content Guidelines
- Focus on WHY, not just WHAT
- Write like telling a friend something cool
- No jargon unless audience expects it
- Be concise but complete
- Include emotion and outcomes, not just features`;

export function buildChatBlogPrompt(userInput: string, category?: string) {
  return `User wants to blog about:

"${userInput}"

${category ? `Category hint: ${category}` : 'No category specified.'}

Either generate the content or ask ONE clarifying question.`;
}
```

---

## Voice Recording Implementation

```typescript
// components/admin/voice-recorder.tsx

"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onError: (error: string) => void;
}

export function VoiceRecorder({ onTranscript, onError }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      // Set up audio visualization
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start recording
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      drawWaveform();
    } catch (err) {
      onError("Microphone access denied");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      // Upload to Supabase Storage (bypasses Vercel 4.5MB limit)
      const supabase = createClient();
      const fileName = `voice-${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('blog-audio')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('blog-audio')
        .getPublicUrl(fileName);

      // Call transcription API
      const res = await fetch('/api/blog/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: publicUrl }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      onTranscript(data.transcript);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const drawWaveform = () => {
    // Canvas waveform visualization logic
    // ... (animate audio levels)
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas ref={canvasRef} className="w-full h-16 rounded-lg bg-muted" />

      {isProcessing ? (
        <Button disabled size="lg" className="rounded-full w-16 h-16">
          <Loader2 className="w-6 h-6 animate-spin" />
        </Button>
      ) : isRecording ? (
        <Button
          onClick={stopRecording}
          size="lg"
          variant="destructive"
          className="rounded-full w-16 h-16 animate-pulse"
        >
          <Square className="w-6 h-6" />
        </Button>
      ) : (
        <Button
          onClick={startRecording}
          size="lg"
          className="rounded-full w-16 h-16"
        >
          <Mic className="w-6 h-6" />
        </Button>
      )}

      <p className="text-sm text-muted-foreground">
        {isProcessing ? "Transcribing..." : isRecording ? "Recording... tap to stop" : "Tap to record"}
      </p>
    </div>
  );
}
```

---

## Cron Configuration

```json
// vercel.json (add to existing or create)
{
  "crons": [
    {
      "path": "/api/cron/daily-summary",
      "schedule": "0 0 * * *"
    }
  ]
}
```

```typescript
// app/api/cron/daily-summary/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { DAILY_SUMMARY_SYSTEM, buildDailySummaryPrompt } from '@/lib/blog/daily-summary-prompt';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Fetch commits from last 24h via GitHub API
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `https://api.github.com/repos/goldenfocus/dalat-app/commits?since=${since}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    const commits = await res.json();

    if (!Array.isArray(commits) || commits.length === 0) {
      return NextResponse.json({ message: 'No commits today' });
    }

    // 2. Generate summary with AI
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: DAILY_SUMMARY_SYSTEM,
      messages: [{
        role: 'user',
        content: buildDailySummaryPrompt(
          commits.map((c: any) => ({
            message: c.commit.message,
            author: c.commit.author.name,
            sha: c.sha,
          }))
        ),
      }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse JSON response
    let jsonText = textContent.text.trim();
    if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
    if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
    if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);

    const summary = JSON.parse(jsonText.trim());

    // 3. Get changelog category ID
    const { data: category } = await supabase
      .from('blog_categories')
      .select('id')
      .eq('slug', 'changelog')
      .single();

    // 4. Create draft post
    const today = new Date().toISOString().split('T')[0];
    const slug = `daily-update-${today}`;

    const { data: post, error } = await supabase
      .from('blog_posts')
      .insert({
        title: summary.title,
        slug,
        story_content: summary.story_content || '',
        technical_content: summary.technical_content,
        source: 'daily_summary',
        status: 'draft',
        category_id: category?.id,
        summary_date: today,
        areas_changed: summary.areas_changed,
        seo_keywords: summary.seo_keywords || [],
        meta_description: summary.one_line_summary,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      post_id: post.id,
      has_narrative: summary.has_meaningful_narrative,
    });
  } catch (err) {
    console.error('Daily summary error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

---

## Environment Variables Needed

```bash
# Existing (already configured)
ANTHROPIC_API_KEY
GOOGLE_AI_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GITHUB_WEBHOOK_SECRET

# New (need to add)
OPENAI_API_KEY           # For Whisper transcription
CRON_SECRET              # For Vercel cron auth (generate random)
GITHUB_TOKEN             # For GitHub API (repo read access)
```

---

## Storage Bucket

Create via Supabase dashboard or migration:
```sql
-- blog-audio bucket for voice recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-audio', 'blog-audio', false)
ON CONFLICT DO NOTHING;

-- Admin-only upload
CREATE POLICY "blog_audio_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'blog-audio' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- Public read for transcription API
CREATE POLICY "blog_audio_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'blog-audio');
```

---

## Lifecycle Statuses

| Status | Meaning | Visibility | Use Case |
|--------|---------|------------|----------|
| `draft` | Not published | Admin only | New posts, review |
| `experimental` | Published, marked WIP | Public with badge | Beta features |
| `published` | Normal published | Public | Default goal |
| `deprecated` | Outdated | Public with notice | Old features |
| `archived` | Hidden | Admin only | Deleted content |

---

## Admin Sidebar Update

```typescript
// In app/[locale]/admin/layout.tsx, add to navItems:
{
  href: "/admin/blog",
  label: t("navBlog"), // Add translation: "Blog"
  icon: "FileText",
  show: isAdmin, // admin/superadmin only
}
```

---

## Verification Checklist

### Lane A (Automated)
- [ ] Cron triggers at midnight UTC
- [ ] Fetches commits from last 24h
- [ ] Classifies commits correctly
- [ ] Groups by area
- [ ] Generates appropriate content (technical always, story when meaningful)
- [ ] Creates DRAFT post
- [ ] Admin can review, edit, publish

### Lane B (Human)
- [ ] `/admin/blog/new` opens chat interface
- [ ] Shows "Hey — what do you want to blog about?"
- [ ] Voice button works, records properly
- [ ] Transcription via Whisper works
- [ ] AI generates dual content
- [ ] At most ONE clarifying question
- [ ] Preview shows both versions
- [ ] Can edit before publishing
- [ ] Publish creates correct post

### Shared
- [ ] `/admin/blog` lists all posts
- [ ] Filter by source (daily_summary, manual)
- [ ] Filter by status
- [ ] Status badges display correctly
- [ ] Edit page loads with existing data
- [ ] Delete archives (or hard deletes)
- [ ] Non-admins redirected from /admin/blog
- [ ] Mobile: 44px touch targets

---

## What NOT to Build

- No complex approval workflows
- No new microservices
- No heavy rule engines
- No comment system
- No multi-author attribution
- No WordPress-like editor
- No separate blogger role (use admin/superadmin)
