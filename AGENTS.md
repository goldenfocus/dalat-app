# Golden Focus DaLat App — Agent Instructions

## Activity Graph visual truth standard

This is a hard user requirement for every public Activity Graph event page.

- Never use deterministic fact-art, generic gradient cards, templated event posters, placeholder art, or imagery from another event as an event hero or promo image.
- First choice: an actual event image from a canonical organizer or venue source, only when the owner has authorized reuse. Keep the source URL and any required attribution with the media record.
- If authentic owner-authorized event imagery is unavailable, create an event-specific, ultra-realistic AI illustrative image. It must be a high-converting visual hook grounded in the verified event context, with natural people/place/action; no text, logos, watermarks, poster layout, or invented factual claims.
- Never present AI imagery as documentary event photography. Its alt text and promo caption must say that it is AI-generated illustrative imagery and not an actual event photo.
- Where the page supports it, add 2–4 distinct, relevant images to `promo_material` / the promo gallery. Apply the same provenance and disclosure rules to every item.
- On a source refresh or reprocessing run, preserve owner-authorized and compliant generated media. Do not replace them with fact-art or generic fallbacks.
- Before handoff, inspect the live public DaLat.app route: verify the hero and each promo-gallery image are visually appropriate, truthful, and correctly disclosed.

If neither owner-authorized imagery nor a safe event-specific illustrative image is available, leave the visual unset and report the gap; do not substitute generic art.

## Activity Graph discovery horizon

The daily scout prioritizes activities happening this calendar month and admits only an exact future start within the next 45 days. A recurring series must have a near-term occurrence. Hold longer-range listings until they are near; never pad the current activity graph with months-away calendar entries.

## Lâm Viên Square date-known exception

Publish official Lâm Viên Square notices with a verified future date even when the exact start time, admission detail, or price is absent. Set `timePrecision: "tba"`, render the time and unknown admission as `TBD`, and render an unknown price as `Unknown`; never guess a time, price, or claim public entry. This exception is limited to Lâm Viên Square and does not relax the evidence contract anywhere else.
