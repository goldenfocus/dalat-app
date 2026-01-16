# dalat.app Development Guidelines

## ⚠️ Critical: Next.js Proxy (NOT Middleware)

**DO NOT rename `proxy.ts` to `middleware.ts`** - this will break production!

Next.js 16 deprecated the "middleware" convention in favor of "proxy":
- File must be named: `proxy.ts` (not `middleware.ts`)
- Function must be named: `proxy` (not `middleware`)

If you see warnings about middleware, the solution is to use `proxy.ts`, NOT to rename it to `middleware.ts`.

See: https://nextjs.org/docs/messages/middleware-to-proxy

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
