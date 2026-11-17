# Cinema auto-score (house soundtrack)

Date: 2026-11-17. Status: code ready, **needs the migration applied** before it does anything.

## Problem

Events without music play cinema mode as a silent slideshow. We do not generate music at view time. When an event has no music of its own, cinema mode plays a track from a house library made of the owner's own catalogue (ChicoMan tracks plus tracks batch-generated locally with ACE-Step). No licensing issue, no API cost.

## How music reaches cinema mode today

- Own music: `event_playlists` (one per event) and `playlist_tracks`, read through the `get_event_playlist(slug)` RPC.
- `app/[locale]/events/[slug]/moments/page.tsx` loads it server side and passes `initialPlaylist` to `MomentsViewContainer`, which calls `useAudioPlayerStore.setPlaylist(...)`. `MiniPlayer` plays it. Cinema slideshow only unlocks autoplay on first tap.
- The unmerged `origin/fix/automatic-event-music` reuses the latest earlier playlist of the same recurring series and host. It does not cover events with no series music; the two are complementary. Series reuse should win over house music (see "Merge order").

## Data model

Table `public.house_tracks` (migration `20261204_001_house_tracks.sql`, not applied):

| column | notes |
|---|---|
| id, file_url (unique), title, artist, thumbnail_url, duration_seconds | track metadata |
| mood | one of `chill, upbeat, acoustic, night, misty, celebration` (CHECK) |
| tags | free text array, informational |
| is_active | soft switch, retire a track without deleting |

RLS: public SELECT where `is_active`; no client write policies. Grants: anon/authenticated SELECT, service_role full.

## Selection rule

`lib/cinema/resolve-soundtrack.ts` (pure, tested):

1. Event has its own tracks: play them, `isHouse = false`.
2. Library empty: no tracks, `isHouse = false` (clean no-op).
3. Otherwise pick a pool: the first mood in the event's preferred list that has tracks, else the whole library. Preferred moods come from `moodsForHints(event.ai_tags + activity_kind)` using a small keyword map.
4. Pool is sorted by id, start index = FNV-1a hash of the event id modulo pool size. Return up to 3 consecutive tracks (wrapping) so a short track does not end in silence. Same event, same result, regardless of DB row order.

`lib/cinema/load-house-soundtrack.ts` reads `house_tracks` (Zod validated), calls the resolver and returns `{tracks, playlistInfo}` with `playlistInfo.isHouse = true`, or null on empty/error/missing table. It is called from the moments page only when the event has no playlist.

## UI

`PlaylistInfo.isHouse` is exposed in the audio store. `MiniPlayer` shows "House soundtrack · artist" using `playlist.houseSoundtrack` (all 12 locales). The cinema controls agent can read `useAudioPlayerStore((s) => s.playlist?.isHouse)` for any label there.

## Loading tracks (owner)

1. Upload mp3 files to the existing R2 bucket (same storage as playlist audio) and note public URLs.
2. Insert rows with the service role (SQL editor or a local script):

```sql
insert into public.house_tracks (file_url, title, artist, mood, tags, duration_seconds)
values ('https://cdn.example/house/slow-refill.mp3', 'Slow Refill', 'chicoman', 'chill', '{lofi,cafe}', 124);
```

3. Retire with `update public.house_tracks set is_active = false where id = ...`.

## Suggested starter library (60 tracks, 10 per mood)

Aim for 90 to 150 seconds, instrumental, loop-friendly endings, loudness around -16 LUFS. Titles are working names.

### chill (Slow coffee-shop and lazy-afternoon instrumentals; genre hint: lo-fi)
1. Cà phê Xuân Hương
2. Slow Refill
3. Window Seat
4. Rainy Terrace
5. Soft Focus
6. Paper Cup Sunday
7. Warm Mug
8. Late Brunch
9. Page Turner
10. Easy Hour

### upbeat (Festival, market, DJ and sports energy; genre hint: house)
1. Market Day
2. Pedal Faster
3. Golden Hour Groove
4. Street Food Shuffle
5. Bright Lights
6. Sunny Side Beat
7. Crowd Pleaser
8. Hands Up Hills
9. Spring Loaded
10. Good Vibes Only

### acoustic (Open-mic and campfire guitar warmth; genre hint: folk)
1. Pine Porch
2. Fingerstyle Morning
3. Open Mic Opener
4. Campfire Chords
5. Wooden Heart
6. Hill Tribe Lullaby
7. Porch Swing
8. Slow Strum
9. Kind Hands
10. Café Baho Unplugged

### night (Bars, jazz, lounge and after-dark events; genre hint: lounge)
1. Last Call Blue
2. Velvet Alley
3. Neon Drizzle
4. Midnight Pho
5. Smoky Room
6. Low Lamp
7. After Hours
8. Taxi Light
9. Cocktail Hour
10. Slow Elevator

### misty (Hikes, sunrise, gardens, forest and waterfall visuals; genre hint: ambient)
1. Fog on the Pines
2. Sunrise Ridge
3. Dew Point
4. Lake Xuan Huong Dawn
5. Flower Valley
6. Trailhead
7. Cloud Walk
8. Greenhouse Light
9. Quiet Summit
10. Mist Lifting

### celebration (Birthdays, weddings, anniversaries, Tet and milestones; genre hint: uplifting)
1. Confetti Rain
2. First Dance
3. Cheers Everyone
4. Long Table
5. Lantern Night
6. Big Day
7. Toast to Us
8. Together Again
9. Party Lights
10. Brand New Year

## Merge order and caveats

- Merge `fix/automatic-event-music` first if wanted; then house music should be the last fallback inside `resolveEventMusic`. Until then the moments page edit is a two-line wrap and will conflict trivially.
- The lightbox provider path (`moments-lightbox-provider.tsx`) and the client-side fallback in `MomentsViewContainer` still only know own playlists; house music applies to the moments page server path.
- The MiniPlayer title button links to the event playlist page, which is empty for house tracks. Decide whether to hide that link when `isHouse`.
- House tracks have no lyrics or karaoke data.
