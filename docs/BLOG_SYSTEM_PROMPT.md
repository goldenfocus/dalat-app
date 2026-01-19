# Elite Execution Prompt - Blog Admin System

Copy everything below this line and paste into a fresh Claude Code session:

---

## Mission

Implement the two-lane blog admin system for dalat.app as specified in `docs/BLOG_SYSTEM_SPEC.md`. This is a production codebase with existing patterns - follow them precisely.

## Execution Mode

Use `/ralph-loop` to enter autonomous execution mode. Work through all phases systematically, committing after each major milestone.

## Pre-Flight

1. Read `docs/BLOG_SYSTEM_SPEC.md` completely - this is your source of truth
2. Read `CLAUDE.md` for project conventions (touch targets, patterns)
3. Scan existing patterns:
   - `app/[locale]/admin/festivals/page.tsx` - admin page pattern
   - `components/admin/festival-form.tsx` - form pattern
   - `lib/blog/content-generator.ts` - AI prompt pattern
   - `components/ui/ai-enhance-textarea.tsx` - AI enhancement

## Execution Order

### Phase 1: Database Foundation
```
1. Create migration: supabase/migrations/20260119_001_blog_two_lanes.sql
   - Enhanced status constraint (5 states)
   - New source type (daily_summary)
   - New columns (summary_date, areas_changed)
   - admin_get_blog_posts() function
   - admin_delete_blog_post() function

2. Run migration: supabase db push
3. Verify: Check tables updated correctly
4. Commit: "feat(blog): add two-lanes schema and admin functions"
```

### Phase 2: Admin List Page
```
1. Update app/[locale]/admin/layout.tsx - add blog nav item
2. Create app/[locale]/admin/blog/page.tsx - following festivals pattern
3. Create components/admin/blog-post-row.tsx
4. Test: Visit /admin/blog, see empty state or existing posts
5. Commit: "feat(blog): add admin blog list page"
```

### Phase 3: Edit Capability
```
1. Create app/[locale]/admin/blog/[id]/edit/page.tsx
2. Create components/admin/blog-post-form.tsx
3. Create app/api/blog/[id]/route.ts (GET, PATCH, DELETE)
4. Test: Edit existing post, change status, save
5. Commit: "feat(blog): add blog post editing"
```

### Phase 4: Lane B - Chat-First Creation
```
1. Create lib/blog/chat-blog-prompt.ts
2. Create app/api/blog/generate/route.ts
3. Create components/admin/voice-recorder.tsx
4. Create app/api/blog/transcribe/route.ts (Whisper)
5. Create components/admin/blog-chat-interface.tsx
6. Create app/[locale]/admin/blog/new/page.tsx
7. Create blog-audio storage bucket (via migration or dashboard)
8. Test: Full voice-to-blog flow
9. Commit: "feat(blog): add chat-first blog creation with voice"
```

### Phase 5: Lane A - Daily Summaries
```
1. Create lib/blog/daily-summary-prompt.ts
2. Create app/api/cron/daily-summary/route.ts
3. Update vercel.json with cron config
4. Test: Manually trigger cron endpoint
5. Commit: "feat(blog): add daily changelog summary cron"
```

### Phase 6: Polish
```
1. Add source filter to list page
2. Add lifecycle status badges
3. Mobile responsiveness check
4. Final testing
5. Commit: "feat(blog): polish admin UI and add filters"
```

## Quality Gates

After each phase, verify:
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] No console errors in browser
- [ ] Mobile touch targets ≥ 44px
- [ ] Follows existing patterns (no new paradigms)

## Key Rules

1. **Read before writing** - Always read existing files before modifying
2. **Follow patterns** - Copy existing code structures, don't innovate
3. **Test locally** - Verify each feature works before committing
4. **Atomic commits** - One logical change per commit
5. **No over-engineering** - Simple, focused, minimal

## Error Recovery

If something breaks:
1. Check TypeScript errors first
2. Verify imports are correct
3. Check Supabase RLS policies
4. Read the spec file again

## Environment Variables

Ensure these are set before testing voice/cron:
```
OPENAI_API_KEY           # For Whisper
CRON_SECRET              # For Vercel cron (generate: openssl rand -hex 32)
GITHUB_TOKEN             # For commit fetching
```

## Success Criteria

- [ ] Admin can see all blog posts at `/admin/blog`
- [ ] Admin can filter by source and status
- [ ] Admin can edit any post
- [ ] Admin can delete/archive posts
- [ ] Admin can create post via chat interface
- [ ] Voice recording → transcription → content works
- [ ] Daily cron creates draft summary
- [ ] All UI is mobile-friendly
- [ ] No TypeScript errors

## Go

Start with: `Read docs/BLOG_SYSTEM_SPEC.md`

Then: `/ralph-loop` to begin autonomous execution

---

End of prompt.
