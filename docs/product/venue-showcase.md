# Venue showcase

The canonical business page shows one upcoming occurrence per recurring activity, then six past-event photo highlights and the past-event archive. The menu remains server-rendered inside an expandable section. Official website/menu links also appear on each public event with a linked venue; they are ordinary venue links, not sponsorship claims.

Highlights use anonymous read access to published photos from completed, public events at that venue. Ranking uses existing featured priority, image quality and views, with variety across events. Venue owners, accepted editors and admins can select up to six photos in display order or return to automatic selection. Private, removed and foreign-venue photos cannot be selected. No new AI image analysis is performed.

Social House's official JSON-LD menu is read daily at 21:15 UTC by `/api/cron/sync-venue-menus`. The source is fixed to `https://socialhousedalat.com/menu/`, and malformed/partial menus fail before writes. `sync_official_venue_menu` applies changes atomically and retains item IDs and order history. Changes made by the owner after the last import take precedence; sold-out and availability flags stay local. Items removed from the source become unavailable. Custom event drinks remain separate. Public menu names/notes use the existing translation registry and transactional invalidation.

The source connection does not introduce delivery, online payment, or a new checkout. It feeds the existing event preorder workflow. The venue's official-menu URL preserves the owner's referral parameters.

Checks: `vitest run`, `npm run prebuild`, `tsc --noEmit`, `npm run build`; `supabase/tests/venue-showcase*.sql` in a disposable PostgreSQL database; live mobile/desktop gallery, owner save/refresh/reset, anonymous write denial, event backlinks, translated routes and venue SEO audit.
