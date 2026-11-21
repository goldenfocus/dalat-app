# lib/recap

One `recap.json` timeline per event (`RecapSpec`, version 1). It drives two renderers: the in-browser cinema player and an offline 1080x1920, 30 fps MP4 render (20-40 s) made on the owner's Macs. This folder is pure TypeScript: no database, no rendering, no UI, no `Math.random`, no clock.

## Files

- `spec.ts`: Zod schema, inferred types, `validateRecapSpec(unknown)` returning `{ ok: true, spec }` or `{ ok: false, errors: RecapSpecIssue[] }` with typed `code`s.
- `build-spec.ts`: `buildRecapSpec(input, options)` returns `{ spec, reason: null }` or `{ spec: null, reason }`. Reasons: `too_few_moments`, `too_short`, `invalid_spec`.
- `source-hash.ts`: local FNV-1a based 64-bit hash (16 hex chars) over canonical JSON.
- `defaults.ts`: local `pickMotion` / `pickTransition` stand-ins and their types.

## Spec fields

| Field | Meaning |
|---|---|
| `specVersion` | Always `1`. |
| `event` | `id`, `slug`, `title` (official name, never translated), `localDate` (YYYY-MM-DD, Asia/Ho_Chi_Minh), `venueName`, `canonicalUrl`. |
| `output` | `width` 1080, `height` 1920, `fps` 30, `totalDurationMs`. |
| `soundtrack` | `null` (silent) or `fileUrl`, `title`, `artist`, `isHouse`, `startOffsetMs`, optional `bpm` and `beatTimesMs`. Beat times are in track time; timeline `t` plays track time `t + startOffsetMs`. |
| `titleCard` / `endCard` | `startMs`, `durationMs`, `headline`, `subline`; the end card also has `ctaUrl`. No CTA label: renderers localize it from message catalogs. |
| `shots` | Ordered. Photo: `mediaUrl`, `width`/`height` (nullable), `motion` id, `fit` (`cover` or `contain-blur`). Video: `mediaUrl` and/or `streamUid`, `inMs`, `outMs`, `muted`. Both: `id` (moment id), `startMs`, `durationMs`, `transition { id, durationMs }`, `caption { text, sourceLocale } or null`, `credit` (display name or null), `aiGenerated`. |
| `seed` | String; default is the event id. Selection, ordering ties, clip offsets and motion/transition picks derive from it. |
| `disclosures` | Required, may be empty. `{ kind: "ai_generated_media", shotIds }`. Every `aiGenerated` shot must be listed. No prose is stored; renderers localize the visible text. |
| `sourceHash` | Hash of the normalized builder inputs (eligible moments, event, soundtrack, seed, limits, `catalogueVersion`). Equal hash means a re-render can be skipped. It is not a hash of the spec and not cryptographic; a queue that needs a content-addressed key should hash the final spec separately. |

## Invariants (enforced by `validateRecapSpec`)

- Every timing is an integer in ms; durations are positive.
- Timeline order is `titleCard`, all `shots`, `endCard`, back to back from 0 with no gap or overlap, ending exactly at `totalDurationMs`, which is 20,000-40,000.
- A transition into a shot plays during the first `transition.durationMs` of that shot's window, at most half the shot. The outgoing shot stays visible underneath, so transitions never break tiling. The first shot transitions from the title card.
- Video: `outMs - inMs === durationMs` (no speed change) and at least one of `mediaUrl` / `streamUid`.
- Shot ids are unique; disclosures reference existing shots; media URLs are https; beat times strictly increase.

## Builder rules

- Only moments with `status === "published"` are used; the input type requires `status`. Unpublished, rejected or removed moments are dropped before counting and never reach the spec or the hash.
- Photos need an https `mediaUrl`. Videos need `cfVideoUid` or an https `mediaUrl`, `videoStatus` ready (or unset) and a known duration of at least 2 s. Other content types are skipped.
- Fewer than `minMoments` (default 8) eligible moments returns `too_few_moments`.
- Selection: rank by engagement (likes + 2 x comments, capped), caption present, video bonus, then a seeded tie-break. At most 12 shots, at most 4 videos while photos are available, then the selection is re-ordered chronologically. If the cut exceeds 40 s the lowest-ranked shot is dropped until it fits.
- Durations: title 2.5 s, photo 2.5 s, video excerpt 3 s (inside the source), end card 3 s. With beats, each cut moves to the nearest beat within `beatToleranceMs` (default 250) inside the allowed range (title 2-3.5 s, photo 2-3 s, video 2-4 s).
- Captions are the uploader's own text only (never AI descriptions), collapsed and capped at 90 characters.
- Inject `pickMotion(seed, momentId, index, orientation)` and `pickTransition(seed, momentId, index)` to use the lib/cinema catalogue. Ids are opaque strings here. Bump `catalogueVersion` when the catalogue changes so the hash changes.

## How the renderers consume it

- Validate with `validateRecapSpec` first; refuse anything invalid.
- Both renderers are pure functions of `(spec, t)`. They look up `motion` and `transition.id` in the cinema catalogue and must never choose randomly or read `window` (reduced motion is a player-only preference).
- Cinema player: drive the timeline with a clock, play `soundtrack` from `startOffsetMs`, show `caption` and `credit`, and render the `disclosures` notice and original-text control for captions per AGENTS.md.
- MP4 render: resolve `streamUid` or `mediaUrl` server-side to short-lived URLs just before rendering, seek video by `inMs`, mute clips when `muted`, mix `soundtrack`, then hand the file to the QC gate.
- Localize captions through the translation registry using `sourceLocale`; keep the original available.
