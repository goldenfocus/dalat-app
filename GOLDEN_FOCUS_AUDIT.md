# Golden Focus Core - Feature Audit

## Feature Comparison Matrix

| Feature | dalat-app | vibelog | Winner | Notes |
|---------|-----------|---------|--------|-------|
| **AUTHENTICATION** |
| Google OAuth | Yes | Yes | **dalat** | More polished with locale-aware redirects |
| Email/Password | Yes | Yes | **dalat** | Full forgot/reset flow |
| Apple OAuth | No | No | - | To build |
| GitHub OAuth | No | No | - | To build |
| Session Management | Supabase SSR | Supabase SSR | **tie** | Same pattern |
| **USER PROFILES** |
| Profile CRUD | Yes | Yes | **dalat** | More complete with verification badges |
| Avatar Upload | Yes (R2) | Yes (Supabase) | **dalat** | R2 is better for CDN |
| Bio with AI enhance | Yes | Yes | **tie** | Both have AIEnhanceTextarea |
| Social Links | No | Yes | **vibelog** | Twitter, GitHub, etc. |
| **NOTIFICATIONS** |
| In-App | Yes | Yes | **dalat** | More notification types |
| Push (Web) | Yes | Yes | **dalat** | Multi-device, notification modes |
| Email | Yes (Resend) | Yes | **dalat** | Bulk sending, templates |
| Preferences | Yes | Yes | **dalat** | Per-type, per-channel control |
| Real-time delivery | Yes | Yes | **tie** | Both use Supabase Realtime |
| **COMMENTS** |
| Nested Replies | Yes | Yes | **tie** | Both have parent_comment_id |
| Moderation | Yes | Yes | **dalat** | Hide/unhide with notes |
| Thread Muting | Yes | No | **dalat** | Unique feature |
| Voice/Video Comments | No | Yes | **vibelog** | Multi-modal |
| Reactions | Basic | Yes | **vibelog** | Universal polymorphic system |
| Translation | Yes | No | **dalat** | Auto-translate to 12 languages |
| **MESSAGING/CHAT** |
| Direct Messages | No | Yes | **vibelog** | Full DM system |
| Group Conversations | No | Yes | **vibelog** | Multi-participant |
| Read Receipts | No | Yes | **vibelog** | Message reads tracking |
| Typing Indicators | No | Yes | **vibelog** | Real-time presence |
| Voice Messages | No | Yes | **vibelog** | Voice message player |
| **MEDIA** |
| Image Upload | Yes (R2) | Yes (Supabase) | **dalat** | R2 + Cloudflare CDN |
| Image Compression | Yes | Yes | **tie** | Both client-side |
| Video Upload | Yes | Yes | **tie** | Both have processing |
| Video Compression | Yes (FFmpeg.wasm) | Yes | **dalat** | More mature |
| Audio Player | Yes | Yes | **vibelog** | Global player, waveform |
| Audio Metadata | Yes | Yes | **tie** | Both extract metadata |
| **I18N** |
| UI Translations | 12 languages | 12 languages | **tie** | Same next-intl setup |
| Content Translation | Yes (Google) | Yes (OpenAI) | **dalat** | More content types |
| **SEARCH** |
| Full-text | Yes | Yes | **tie** | Both PostgreSQL FTS |
| Semantic/Vector | Yes | Yes | **vibelog** | Vibe Brain is more advanced |
| Query Expansion | Yes | No | **dalat** | Claude-powered synonyms |
| **ADMIN** |
| Dashboard | Yes | Basic | **dalat** | More comprehensive |
| User Management | Yes | Yes | **dalat** | Roles, verification |
| Content Moderation | Yes | Yes | **tie** | Both have hide/unhide |
| Audit Logging | No | Yes | **vibelog** | Admin action tracking |
| **SOCIAL** |
| Follows | Basic | Yes | **vibelog** | Full follow system |
| Likes/Reactions | Basic | Yes | **vibelog** | Polymorphic reactions |
| Tribes/Groups | Yes | Channels | **dalat** | More features |
| **AI FEATURES** |
| Text Enhancement | Yes | Yes | **tie** | Both use Claude |
| Image Generation | Yes (Gemini) | Yes (Gemini/DALL-E) | **dalat** | Persona references |
| Transcription | No | Yes | **vibelog** | Whisper integration |
| Cost Tracking | No | Yes | **vibelog** | Per-user AI costs |
| RAG/Chat | No | Yes | **vibelog** | Vibe Brain |
| **INFRASTRUCTURE** |
| Rate Limiting | No | Yes | **vibelog** | Per-user quotas |
| Error Handling | Basic | Yes | **vibelog** | Centralized system |
| Analytics Events | Basic | Yes | **vibelog** | 40+ typed events |
| Background Jobs | Yes (Inngest) | No | **dalat** | Reliable job system |

## Golden Implementations (Best of Both)

### Tier 1: Must Have (Core)
1. **Auth System** - dalat-app (add more providers)
2. **Notifications** - dalat-app (3 channels, preferences)
3. **Storage** - dalat-app (R2 + abstraction layer)
4. **i18n** - dalat-app (12 languages, content translation)

### Tier 2: Essential Features
5. **Comments** - Merge: dalat structure + vibelog reactions
6. **Messaging/DMs** - vibelog (full system)
7. **Audio Player** - vibelog (global player, Zustand)
8. **Image Processing** - dalat-app (R2 CDN)

### Tier 3: Nice to Have
9. **AI Text Enhancement** - Both (same pattern)
10. **Search** - Merge: dalat FTS + vibelog embeddings
11. **Rate Limiting** - vibelog
12. **Error Handling** - vibelog
13. **Analytics** - vibelog (typed events)
14. **Admin Panel** - dalat-app (more complete)

### Tier 4: Advanced
15. **Background Jobs** - dalat-app (Inngest)
16. **AI Image Generation** - dalat-app (personas)
17. **Transcription** - vibelog
18. **RAG/AI Chat** - vibelog (Vibe Brain)

## Recommended Stack

```
Framework:     Next.js 16 + React 19 + TypeScript
Database:      Supabase (PostgreSQL + Auth + Realtime)
Storage:       Cloudflare R2 (primary) + Supabase (fallback)
CDN:           Cloudflare (images, static assets)
Email:         Resend
Push:          Web Push API (VAPID)
Background:    Inngest
AI:            Claude (text), Gemini (images), Whisper (audio)
i18n:          next-intl
UI:            Tailwind + shadcn/ui + Radix
State:         Zustand (for audio, etc.)
```

## Module Structure (Proposed)

```
golden-focus-core/
├── packages/
│   ├── auth/                 # Authentication (Google, GitHub, Apple, Email)
│   ├── notifications/        # Push, Email, In-App
│   ├── storage/              # R2/Supabase abstraction
│   ├── comments/             # Comments + Reactions
│   ├── messaging/            # DMs + Group chat
│   ├── media/                # Image/Video/Audio processing
│   ├── audio-player/         # Global audio player
│   ├── i18n/                 # Translations (UI + content)
│   ├── search/               # FTS + Vector search
│   ├── admin/                # Admin dashboard components
│   ├── ai/                   # Text enhance, image gen, transcription
│   ├── analytics/            # Event tracking
│   ├── rate-limit/           # Request limiting
│   └── errors/               # Error handling
├── templates/
│   ├── minimal/              # Auth + Profiles only
│   ├── social/               # + Comments, Messaging, Follows
│   ├── media/                # + Media handling, Audio player
│   └── full/                 # Everything
├── cli/
│   └── create-app/           # CLI generator
└── web/
    └── configurator/         # Web UI for selecting features
```

## Next Steps

1. [ ] Create monorepo structure with Turborepo
2. [ ] Extract auth module from dalat-app
3. [ ] Extract notifications module from dalat-app
4. [ ] Extract storage module from dalat-app
5. [ ] Extract messaging module from vibelog
6. [ ] Extract audio player from vibelog
7. [ ] Build CLI tool for scaffolding
8. [ ] Build web configurator UI
