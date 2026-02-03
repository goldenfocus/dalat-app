# Karaoke-Style Synchronized Text Feature

## IMPORTANT: Re-evaluate This Plan First

Before implementing, use the **Explore** agent to:
1. Review the current audio player implementation in `lib/stores/audio-player-store.ts` and `components/audio/mini-player.tsx`
2. Check if any similar features already exist (transcripts, subtitles, captions)
3. Identify the best integration points
4. Consider if the proposed architecture can be simplified further

**Ask yourself:** Is there a simpler way to achieve 80% of the value with 20% of the effort?

---

## Feature Overview

Build a karaoke-style text display that syncs with audio playback, showing Vietnamese text with English translations highlighted word-by-word or line-by-line as the audio plays. Primary use case: help listeners learn Vietnamese while enjoying audio content.

### Inspiration
- EZViet language learning app (word-by-word highlighting)
- Spotify's time-synced lyrics
- Apple Music's lyric animation

---

## Architecture Summary

### Data Flow
```
Audio plays → currentTime updates (Zustand) → Binary search finds current segment → UI highlights
```

### Key Components
1. **Data Layer**: Types + Supabase table for storing timed transcripts
2. **UI Layer**: Karaoke display component with CSS animations
3. **Pipeline Layer**: Auto-transcription (Whisper) + translation (existing Google Translate)

---

## Phase 1: Data Layer

### 1.1 Create Types

Create `lib/types/synced-lyrics.ts`:

```typescript
export interface SyncedLyricsDocument {
  metadata: {
    language: string;           // 'vi' for Vietnamese
    title: string;
    duration: number;           // milliseconds
    syncLevel: 'line' | 'word';
    availableTranslations: string[];  // ['en', 'ko', 'zh', ...]
  };
  sections: SyncedSection[];
}

export interface SyncedSection {
  id: string;
  startTime: number;            // milliseconds
  endTime: number;
  content: string | SyncedWord[];
  translations?: Record<string, string>;  // { en: "Hello", ko: "안녕" }
}

export interface SyncedWord {
  text: string;
  startTime: number;            // relative to section start (ms)
  endTime?: number;
  romanization?: string;        // phonetic guide
}

// For the UI component
export interface CurrentSegmentInfo {
  sectionIndex: number;
  section: SyncedSection;
  wordIndex?: number;           // if word-level sync
  progressInSection: number;    // 0-1
}
```

### 1.2 Database Migration

Create `supabase/migrations/YYYYMMDD_add_audio_transcripts.sql`:

```sql
CREATE TABLE audio_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Link to source (could be moment, audio track, etc.)
  source_type TEXT NOT NULL,  -- 'moment', 'audio_track', 'playlist_item'
  source_id UUID NOT NULL,

  -- Transcript data
  source_language TEXT DEFAULT 'vi',
  transcript JSONB NOT NULL,  -- SyncedLyricsDocument

  -- Metadata
  status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'reviewing', 'published')),
  confidence_score FLOAT,     -- From Whisper, 0-1

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX idx_audio_transcripts_source ON audio_transcripts(source_type, source_id);
CREATE INDEX idx_audio_transcripts_language ON audio_transcripts(source_language);

-- RLS
ALTER TABLE audio_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published transcripts"
  ON audio_transcripts FOR SELECT
  USING (status = 'published');

CREATE POLICY "Authenticated users can create transcripts"
  ON audio_transcripts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
```

---

## Phase 2: UI Components

### 2.1 Core Hook: useCurrentSection

Create `lib/hooks/use-current-section.ts`:

```typescript
import { useMemo } from 'react';
import { useAudioPlayerStore } from '@/lib/stores/audio-player-store';
import type { SyncedSection, CurrentSegmentInfo } from '@/lib/types/synced-lyrics';

// Binary search for O(log n) performance
function findCurrentSection(
  sections: SyncedSection[],
  currentTimeMs: number
): CurrentSegmentInfo | null {
  let left = 0;
  let right = sections.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const section = sections[mid];

    if (currentTimeMs >= section.startTime && currentTimeMs < section.endTime) {
      const progressInSection =
        (currentTimeMs - section.startTime) / (section.endTime - section.startTime);

      return {
        sectionIndex: mid,
        section,
        progressInSection,
      };
    }

    if (currentTimeMs < section.startTime) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return null;
}

export function useCurrentSection(sections: SyncedSection[]) {
  // currentTime is in seconds, convert to ms
  const currentTimeMs = useAudioPlayerStore(state => state.currentTime * 1000);

  return useMemo(
    () => findCurrentSection(sections, currentTimeMs),
    [sections, currentTimeMs]
  );
}
```

### 2.2 Main Component: KaraokeLyricsView

Create `components/audio/karaoke-lyrics-view.tsx`:

Key features:
- Display 1 previous line (dimmed), current line (highlighted), 1 next line (dimmed)
- Current line shows word-by-word progress if available
- Translation appears below original text
- Tap any line to seek to that position
- Auto-scroll to keep current line in view
- Language toggle button

**CSS Animation approach:**
```css
/* Highlight states */
.lyric-line { opacity: 0.4; transition: all 0.3s ease; }
.lyric-line.active { opacity: 1; transform: scale(1.02); }
.lyric-line.past { opacity: 0.6; }

/* Word highlighting */
.word { transition: color 0.2s, text-shadow 0.2s; }
.word.active {
  color: var(--primary);
  text-shadow: 0 0 8px rgba(var(--primary-rgb), 0.4);
}
```

### 2.3 Integration with MiniPlayer

The karaoke view should:
1. Subscribe to the same Zustand store as MiniPlayer
2. Show/hide via a toggle button in controls
3. Can be a modal/sheet overlay or inline expansion

---

## Phase 3: Transcription Pipeline

### 3.1 Extend Existing Whisper Integration

Your app already has Whisper at `/app/api/blog/transcribe/route.ts`. Extend it or create new endpoint:

`/app/api/audio/transcribe/route.ts`:
- Accept audio file URL or ID
- Call OpenAI Whisper with `timestamp_granularities: ['segment']`
- Parse response into SyncedLyricsDocument format
- Trigger translations via existing `triggerTranslation()` system

### 3.2 Translation Integration

Use existing `lib/translations-client.ts` pattern:
```typescript
triggerTranslation("audio_transcript", transcriptId, [
  { field_name: "content", text: vietnameseText },
]);
```

This triggers translation to all 12 supported languages.

### 3.3 Cost Estimate
- Whisper: $0.006/minute
- Translation: ~$0.02/file (12 languages via Google Translate)
- **Total: ~$12-15 per 30-minute audio file**

---

## Tools & Agents to Use

### For Research/Planning
```
@agent Explore - Use for codebase exploration
  - Find existing audio/transcript code
  - Understand current patterns
  - Identify integration points

@agent Plan - Use for architecture decisions
  - Component hierarchy design
  - State management approach
  - Performance optimization strategy
```

### For Implementation
```
@agent code-architect - Design the feature architecture
@agent code-reviewer - Review implementation for quality
@agent pr-test-analyzer - Ensure test coverage
```

### Key Files to Reference
```
lib/stores/audio-player-store.ts    - Zustand store with currentTime
components/audio/mini-player.tsx    - Current audio player UI
lib/translations-client.ts          - Translation trigger system
app/api/blog/transcribe/route.ts    - Existing Whisper integration
lib/image-cdn.ts                    - Pattern for CDN transformations
```

---

## Implementation Checklist

### Phase 1: Foundation (Do First)
- [ ] Create `lib/types/synced-lyrics.ts` with TypeScript interfaces
- [ ] Create database migration for `audio_transcripts` table
- [ ] Run migration: `npx supabase db push`
- [ ] Create sample test data (hardcoded JSON) for development

### Phase 2: UI Components
- [ ] Create `lib/hooks/use-current-section.ts` with binary search
- [ ] Create `components/audio/karaoke-lyrics-view.tsx`
- [ ] Add CSS transitions for smooth highlighting
- [ ] Integrate with MiniPlayer (toggle button)
- [ ] Add tap-to-seek functionality
- [ ] Add language toggle for translations
- [ ] Test on mobile (touch targets, scrolling)

### Phase 3: Backend Pipeline
- [ ] Create/extend transcription endpoint
- [ ] Parse Whisper response into SyncedLyricsDocument
- [ ] Hook into translation system
- [ ] Add API to fetch transcript by audio ID

### Phase 4: Polish
- [ ] Add loading states
- [ ] Handle missing transcripts gracefully
- [ ] Add error boundaries
- [ ] Performance testing (ensure 60fps)
- [ ] Accessibility review (ARIA, screen readers)

---

## Performance Requirements

1. **Binary search** for finding current segment (O(log n), not O(n))
2. **CSS transitions** only - no JS animation libraries needed
3. **Memoize** segment lookup with useMemo
4. **Avoid re-renders** - use Zustand selectors wisely
5. **Batch updates** - currentTime updates ~4x/sec, that's fine

---

## Testing Strategy

### Manual Testing
1. Load audio with transcript
2. Verify highlighting syncs with playback
3. Test seek by tapping lines
4. Test language toggle
5. Test on slow network (transcript should load fast)
6. Test on mobile Safari and Chrome

### Automated Testing
- Unit tests for binary search function
- Component tests for KaraokeLyricsView
- Integration test: play audio → verify correct section highlighted

---

## Example Test Data

Use this to develop the UI before building the pipeline:

```typescript
const testLyrics: SyncedLyricsDocument = {
  metadata: {
    language: 'vi',
    title: 'Test Song',
    duration: 180000, // 3 minutes
    syncLevel: 'line',
    availableTranslations: ['en'],
  },
  sections: [
    {
      id: '1',
      startTime: 0,
      endTime: 5000,
      content: 'Xin chào các bạn',
      translations: { en: 'Hello everyone' },
    },
    {
      id: '2',
      startTime: 5000,
      endTime: 10000,
      content: 'Hôm nay trời đẹp quá',
      translations: { en: 'The weather is so nice today' },
    },
    {
      id: '3',
      startTime: 10000,
      endTime: 15000,
      content: 'Chúng ta cùng học tiếng Việt nhé',
      translations: { en: "Let's learn Vietnamese together" },
    },
  ],
};
```

---

## Questions to Resolve During Implementation

1. **Where should the karaoke view appear?**
   - Full-screen overlay?
   - Inline expansion in MiniPlayer?
   - Separate page?

2. **Word-level vs line-level sync?**
   - Start with line-level (simpler)
   - Add word-level later if needed

3. **How to handle missing transcripts?**
   - Show "Transcript not available" message
   - Offer to generate one (if audio owner)

4. **Should transcripts be editable?**
   - Start with read-only
   - Add editing later for accuracy corrections

---

## Success Criteria

1. User can see Vietnamese text highlighted in sync with audio
2. English translation visible below each line
3. Tapping a line seeks to that position
4. Smooth animations (no jank)
5. Works on mobile Safari and Chrome
6. Loads fast (transcript JSON is small)

---

## Resources

- Existing audio player: `lib/stores/audio-player-store.ts`
- Translation system: `lib/translations-client.ts`
- Whisper integration: `app/api/blog/transcribe/route.ts`
- UI patterns: `components/audio/mini-player.tsx`
