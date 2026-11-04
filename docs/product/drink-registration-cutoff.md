# Sponsored drink registration cutoff

Social House's recurring language exchange requires a Going RSVP before 16:00 on the event day in Asia/Ho_Chi_Minh, in addition to the existing first-100 limit. A qualifying early registrant can choose or redeem the drink later; physical arrival time does not determine eligibility.

The previous live rule checked only RSVP rank, current Going status, campaign expiry and prior redemption. The 16:00 rule existed in the roadmap but had no implementation or pending commit.

`event_drink_sponsors.registration_cutoff_at` is the event's absolute deadline. The Social House series inherits a local `16:00` deadline for each event date; rescheduling an occurrence updates its deadline. Other campaigns retain their existing behavior when no cutoff is configured.

`language_exchange_rsvp_positions.registered_at` records the first server-observed Going transition. Previously recorded participants are backfilled from RSVP creation time, the available historical registration evidence. Early interest alone does not qualify a future Going transition. Cancelling and rejoining does not rewrite the first Going timestamp. The exact 16:00 boundary is excluded.

The private SQL eligibility function enforces the cutoff for both guest reservations and staff redemption; browser-submitted dates are never trusted. Staff eligibility mirrors that timestamp check. Late registrants use the existing regular paid-menu flow.

The migration cancels only unpaid, unprepared, entirely complimentary reservations that the previous rule gave to late registrants. It preserves the cancelled order's history and does not introduce a charge. Prepared, paid, partially paid or earlier qualifying reservations are not altered.

Validation includes local PostgreSQL boundary, late-redemption, forged-date, status-transition, rescheduling and reservation-repair tests, plus the existing sponsorship and menu-option suite.
