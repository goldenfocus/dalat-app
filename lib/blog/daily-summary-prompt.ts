/**
 * Daily Summary Prompt (Lane A)
 * Transforms commits from the last 24 hours into a structured changelog
 */

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
  "suggested_status": "draft",
  "image_prompt": "Abstract visualization of search and navigation..."
}

## Image Prompt Guidelines
Generate a unique, creative image_prompt that visually represents the day's work:
- VARY the style each day: geometric, organic, landscape, abstract, symbolic
- Draw from the primary area: Events (calendars, gathering), Moments (photos, memories), Auth (keys, locks), Performance (speed, lightning), etc.
- Incorporate Đà Lạt vibes when fitting: misty mountains, pine forests, flowers, French architecture
- Be creative and specific - avoid generic "tech" imagery
- NO text in images, just visuals
- Examples:
  - Events: "Floating paper lanterns at dusk over misty valley, warm amber glow"
  - Performance: "Abstract speed lines through a geometric tunnel, cool blue tones"
  - Auth: "Golden key fragments assembling in mid-air, soft bokeh background"
  - Moments: "Polaroid photos scattered like falling leaves in autumn light"

## Area Classification
- Events: Event creation, editing, RSVPs, search
- Moments: Photo/video sharing, likes, comments
- Auth: Login, registration, profiles, permissions
- Blog: Blog posts, changelogs, RSS
- Admin: Dashboard, moderation, settings
- Performance: Speed, caching, optimization
- Infrastructure: Deploy, CI/CD, dependencies
- Other: Miscellaneous changes

## Commit Message Patterns
- "feat:" → user-visible (usually)
- "fix:" → behavior-change
- "refactor:" → refactor
- "chore:", "ci:", "build:" → infrastructure
- "WIP", "experiment", "try" → experiment
- "perf:" → performance`;

export interface Commit {
  message: string;
  author: string;
  sha: string;
}

export interface DailySummaryOutput {
  has_meaningful_narrative: boolean;
  story_content: string | null;
  technical_content: string;
  title: string;
  areas_changed: string[];
  one_line_summary: string;
  experiments: string[];
  has_breaking_changes: boolean;
  suggested_status: "draft" | "experimental" | "published";
  image_prompt: string;
}

export function buildDailySummaryPrompt(commits: Commit[], date: string): string {
  if (commits.length === 0) {
    return `No commits found for ${date}. Return a minimal summary indicating no changes.`;
  }

  const commitList = commits
    .map((c) => `- ${c.message} (${c.author}, ${c.sha.slice(0, 7)})`)
    .join("\n");

  return `Summarize these commits from the last 24 hours (${date}):

${commitList}

Return valid JSON matching the output format. Be concise but informative.`;
}

/**
 * Detect which areas are affected by a commit message
 */
export function detectAreas(message: string): string[] {
  const lowerMessage = message.toLowerCase();
  const areas: string[] = [];

  const patterns: Record<string, string[]> = {
    Events: ["event", "rsvp", "calendar", "schedule"],
    Moments: ["moment", "photo", "video", "media", "gallery"],
    Auth: ["auth", "login", "signup", "profile", "user", "permission", "role"],
    Blog: ["blog", "changelog", "post", "rss"],
    Admin: ["admin", "dashboard", "moderat", "setting"],
    Performance: ["perf", "cache", "optim", "speed", "fast"],
    Infrastructure: ["ci", "deploy", "build", "docker", "vercel"],
  };

  for (const [area, keywords] of Object.entries(patterns)) {
    if (keywords.some((kw) => lowerMessage.includes(kw))) {
      areas.push(area);
    }
  }

  return areas.length > 0 ? areas : ["Other"];
}
