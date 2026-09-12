# Community foundation

Authorized scope: repair community ownership/permissions/invitation attribution and auth continuation first; then add private-profile setting, community-first event discovery and a share preview using community cover, next public event and an owner-selected past-event photo. Preserve current public RSVP identity. No anonymous-RSVP setting, money, dating, directory or matching subsystem.

Canonical internal `tribes` model remains. `created_by` becomes explicitly current owner; `founder_id` preserves founding history. Ownership transfer is atomic and removes the old owner's management role. Ordinary membership cannot change its role/status/identity; bans survive leaving/rejoining. Invitation acceptance is atomic, expiring and account-bound when addressed to a known account. Approver is not an inviter.

Profile privacy hides profile details with database enforcement, a minimal identity projection for RSVP/avatar links, private metadata and noindex. Publicly authored events/moments and RSVP identity remain public; communicate that before enabling.

Authentication continuation carries a validated local destination and explicit action through OAuth/email/onboarding. Community joins are idempotent; event RSVP offers an explicit also-join choice. Community-origin and inviter are independent acquisition facts; only new account creation is eligible. No financial rights or automatic following.

Shared preview is one collage (social clients do not reliably show all OG images). The cover is primary; next public event and an explicitly selected public past-event photo are secondary. Private media never enters public previews. The user explicitly requested no public AI label on the editable illustrative cover. The upcoming event sits above gallery tabs. Keep original route links compatible.

Known data: Rachel has one real non-ghost account and owns two past Professional Community events. No existing community or September 17 event found. User confirmed September 17, 10:00–12:00 at the same Le Pin venue, optional vegetarian lunch afterward. Prepare an unpublished draft until Rachel supplies her final title/copy. Use community slug professionals with a collision-checked /professionals short handle.

Validation: transaction-rolled-back SQL authorization tests as ordinary/owner/banned/anonymous actors, privacy API probes, unit/route tests, type/lint/build, mobile browser join/auth/RSVP/settings/share journeys, then clean committed release, production deployment and visible verification. Preserve unrelated work. No external invitations sent by this task.

P69 reuse review: keep compatible link/sharing and auth-continuation concepts, reuse DaLat’s existing share hook and image collage transformer. P69 signup has referral-tree and automatic-follow side effects; these are excluded. DaLat retains Supabase identity, no cross-app accounts/data, no payout or multilevel logic.

Added at user request: community insights reuses the existing admin StatCard and database RPC pattern. Owners/community admins and site admins see last-30-day visits, click intents, verified membership conversions, new accounts and membership changes. Site admin index links to each community. Channel-tagged links preserve UTM tags through the short handle. Browser visits are approximate, expire after 30 minutes and honor DNT/GPC; no IP addresses, contact data, full referrers or fingerprints are collected. Raw analytics expire after 90 days. Managers are excluded from visitor metrics. Conversion data starts at release; no historical visit counts are fabricated.
