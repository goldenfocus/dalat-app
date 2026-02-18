# dalat.app Development Guidelines

## Vibe Check

See [VIBE.md](./VIBE.md) for tone and voice guidelines. All user-facing copy should follow the Dalat vibe — warm, chill, helpful, never corporate.

## ⚠️ Multi-AI Workflow

Multiple AI sessions may be running simultaneously on this codebase.

**Before making changes:**
1. Run `git status` to check for uncommitted changes from other sessions
2. If you see changes you didn't make, tell the user before proceeding

**Before committing:**
1. Always ask the user before committing or pushing
2. Never force push or rebase without explicit permission

**If conflicts arise:**
- Stop and inform the user
- Don't try to resolve conflicts automatically

## CLI Tools - Always Use Directly

**NEVER ask the user to run CLI commands.** The following CLIs are authenticated and ready to use:

| Tool | Examples |
|------|----------|
| **Supabase** | `npx supabase db push`, `npx supabase migration list` |
| **Vercel** | `vercel env pull`, `vercel --prod` |
| **GitHub** | `gh pr create`, `gh issue list`, `gh pr merge` |

Run these commands yourself using bash. Don't say "please run this command" - just run it.

## ⛔ CRITICAL: NEVER Create middleware.ts

**THIS HAS BROKEN PRODUCTION MULTIPLE TIMES. READ CAREFULLY.**

Next.js 16 renamed `middleware.ts` to `proxy.ts`. Having both files **crashes the entire app**.

## ⛔ CRITICAL: Moments Strip RPC - PRESERVE cover_moment_id

**THIS HAS BROKEN COVER IMAGES THREE TIMES. READ CAREFULLY.**

When modifying `get_homepage_moments_strip()` in any migration, you **MUST** preserve the cover_moment_id preference in the ORDER BY clause:

```sql
ORDER BY
  m.event_id,
  -- 1. PREFER MANUALLY SELECTED COVER MOMENT (DO NOT REMOVE THIS!)
  CASE WHEN e.cover_moment_id = m.id THEN 0 ELSE 1 END,
  -- 2. Then events user attended
  CASE WHEN r.user_id IS NOT NULL AND r.status = 'going' THEN 0 ELSE 1 END,
  -- 3. Then by quality score
  COALESCE(mm.quality_score, 0.5) DESC,
  m.created_at DESC
```

**History of this bug:**
- June 12: Added event counts, accidentally removed cover logic
- June 23: Fixed by restoring cover_moment_id preference
- June 26: Added audio counts, accidentally removed cover logic AGAIN
- July 3: Fixed AGAIN

**If you need to modify this function:** Copy the ENTIRE existing function first, then add your changes. Do not rewrite the ORDER BY clause from scratch.

| File | Status |
|------|--------|
| `proxy.ts` | ✅ Use this for all request interception |
| `middleware.ts` | ⛔ **NEVER CREATE THIS FILE** |

The build will fail if `middleware.ts` exists (enforced by `prebuild` script).

**If you need middleware functionality:** Edit `proxy.ts` at the project root. That's it.

## Mobile-First Touch Targets

All interactive elements must have a minimum touch target of 44x44px for mobile usability.

### Back Button Pattern

For back/navigation links in headers, use this pattern:

```tsx
<Link
  href="/"
  className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
>
  <ArrowLeft className="w-4 h-4" />
  <span>Back</span>
</Link>
```

Key classes:
- `px-3 py-2` - Padding for ~44px touch target
- `-ml-3` - Negative margin to keep visual alignment at edge
- `active:scale-95` - Touch feedback (slight press effect)
- `active:text-foreground` - Color feedback on press
- `transition-all` - Smooth transitions
- `rounded-lg` - Subtle rounded corners for touch area

For icon-only buttons, use `p-2 -ml-2` instead.

### General Rules

1. All buttons and links should have padding, not just wrap their content tightly
2. Add `active:` states for immediate touch feedback on mobile
3. Use negative margins to maintain visual alignment when adding padding
4. Test on actual mobile devices - hover states don't help there

## ISR Caching with Supabase

**IMPORTANT:** When using `unstable_cache` from Next.js, always use `createStaticClient()` instead of `createClient()`.

| Context | Client to Use |
|---------|---------------|
| Server Components (with request) | `createClient()` |
| `unstable_cache` functions | `createStaticClient()` |
| `generateStaticParams` | `createStaticClient()` |

**Why:** `createClient()` calls `cookies()` which requires an HTTP request context. During ISR (Incremental Static Regeneration), there's no request, so it fails silently and returns empty data.

```tsx
// ❌ WRONG - will fail silently in ISR
export const getCachedData = unstable_cache(async () => {
  const supabase = await createClient(); // Uses cookies()
  // ...
});

// ✅ CORRECT - works in ISR context
export const getCachedData = unstable_cache(async () => {
  const supabase = createStaticClient(); // No cookies needed
  if (!supabase) return [];
  // ...
});
```

## AI-Enhanced Text Input

Use `AIEnhanceTextarea` for any text field where users write content that could benefit from AI polishing (descriptions, bios, posts, etc.). A sparkles button appears when there's text - clicking it sends the text to Claude for enhancement.

### Usage

```tsx
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";

// Basic - sparkles button appears when user types
<AIEnhanceTextarea name="description" rows={3} />

// With context hint (helps AI understand what to optimize for)
<AIEnhanceTextarea
  name="bio"
  context="a user profile bio"
  defaultValue={user.bio}
/>

// Controlled mode
<AIEnhanceTextarea
  value={text}
  onChange={setText}
  context="a social media post"
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `context` | `string` | Hint for AI (e.g., "an event description", "a casual bio") |
| `hideEnhance` | `boolean` | Hide the sparkles button |
| `value` / `onChange` | controlled | For controlled components |
| `defaultValue` | `string` | For uncontrolled components |
| ...rest | textarea props | All standard textarea props supported |

### API

The component calls `POST /api/enhance-text` with:
```json
{ "text": "user's text", "context": "optional context hint" }
```

Returns: `{ "enhanced": "improved text" }`

## Content Translation (The Global Twelve)

**IMPORTANT:** All user-generated content must be translated to support the 12 languages: en, vi, ko, zh, ru, fr, ja, ms, th, de, es, id.

### When to Trigger Translation

After creating or updating any translatable content, call `triggerTranslation()` to translate it to all 12 languages:

```tsx
import { triggerTranslation } from "@/lib/translations-client";

// After creating content (fire-and-forget)
triggerTranslation("event", eventId, [
  { field_name: "title", text: title },
  { field_name: "description", text: description },
]);
```

### Supported Content Types

| Content Type | Translatable Fields |
|--------------|---------------------|
| `event` | `title`, `description` |
| `moment` | `text_content` |
| `profile` | `bio` |
| `blog` | `title`, `story_content`, `technical_content`, `meta_description` |

### Rendering Translated Content

For single items, use the appropriate helper:
```tsx
import { getBlogTranslations, getEventWithTranslations } from "@/lib/translations";

// Blog post
const translations = await getBlogTranslations(post.id, locale, { ... });

// Event
const event = await getEventWithTranslations(slug, locale);
```

For list pages, use batch fetching for efficiency:
```tsx
import { getBlogTranslationsBatch } from "@/lib/translations";

const translations = await getBlogTranslationsBatch(postIds, locale);
```

### Adding New Content Types

To add translation support for a new content type:

1. **Update types** in `lib/types/index.ts`:
   - Add to `TranslationContentType` union
   - Add new fields to `TranslationFieldName` if needed

2. **Create migration** to update database CHECK constraints:
   - Update `content_translations.content_type` constraint
   - Update `content_translations.field_name` constraint if new fields
   - Add `source_locale` column to the new content table
   - Update RLS policies for the new content type

3. **Trigger translation** in the creation/update flow:
   - Import `triggerTranslation` from `lib/translations-client.ts`
   - Call it after successful creation/update

4. **Fetch translations** when rendering:
   - Use `getTranslationsWithFallback()` for single items
   - Create a batch function for list pages if needed

## ⛔ CRITICAL: UI Translations — NEVER Hardcode User-Visible Text

**THIS HAS BROKEN PRODUCTION REPEATEDLY. AI AGENTS KEEP MAKING THESE MISTAKES. READ CAREFULLY.**

This app supports 12 languages. Every piece of text the user sees — headings, buttons, labels, placeholders, empty states, error messages, CTAs, tooltips, toasts, confirmations — **MUST** use `t("keyName")` from `next-intl`.

### Rules (violating ANY of these breaks the app for non-English users)

1. **NEVER write hardcoded English text in components.** No `<h2>Upcoming Events</h2>`. Use `<h2>{t("upcoming")}</h2>`.
2. **NEVER use locale ternaries.** No `locale === "vi" ? "Sự kiện" : "Events"`. This only covers 2 of 12 languages. Use `t("keyName")`.
3. **ALWAYS add translation keys to ALL 12 locale files FIRST, then use the key in the component.**
4. **Missing keys cause `MISSING_MESSAGE` errors and break page rendering.**

### The 12 Locale Files (you MUST update EVERY one)

Translation files are in `messages/` directory. **Check off every file — if you miss even one, that language breaks:**

| # | File | Language |
|---|------|----------|
| 1 | `messages/en.json` | English |
| 2 | `messages/vi.json` | Vietnamese |
| 3 | `messages/ko.json` | Korean |
| 4 | `messages/zh.json` | Chinese |
| 5 | `messages/ru.json` | Russian |
| 6 | `messages/fr.json` | French |
| 7 | `messages/ja.json` | Japanese |
| 8 | `messages/ms.json` | Malay |
| 9 | `messages/th.json` | Thai |
| 10 | `messages/de.json` | German |
| 11 | `messages/es.json` | Spanish |
| 12 | `messages/id.json` | Indonesian |

### Workflow (this order is mandatory)

1. **Write the English text** you need (e.g., "No events found")
2. **Add the key to ALL 12 files** in `messages/` with proper translations
3. **Then** use `t("keyName")` in your component

```tsx
// ❌ WRONG — hardcoded English, breaks for 11 languages
<p>No events found</p>

// ❌ WRONG — only handles 2 of 12 languages
<p>{locale === "vi" ? "Không tìm thấy" : "No events found"}</p>

// ✅ CORRECT — works for all 12 languages
<p>{t("noEventsFound")}</p>
```

**History of this bug:**
- AI agents repeatedly write hardcoded English strings in components
- AI agents write `locale === "vi" ? ... : ...` ternaries that only cover Vietnamese + English
- AI agents add keys to `en.json` and `vi.json` but forget the other 10 files
- Every instance breaks the app for users in 10+ languages
