# Autonomous Activity Scout submission contract

The daily activity scout may publish a finding only by sending JSON to `npm run activity-graph:submit-scout`.

Each object is `{ "source": { ... }, "activity": { ... } }`. All source URLs must be canonical first-party HTTPS URLs on one origin. A one-off activity needs a future exact ISO start time within the next 45 days. A recurring activity needs an exact valid RRULE, clock time, first occurrence, and a near-term occurrence; it uses `timePrecision: "recurring"` and leaves `startsAt` null. The sole schedule exception is an official Lâm Viên Square notice with a verified future date but no exact time: submit it with `timePrecision: "tba"`, a private end-of-day date anchor in `startsAt`, and the visible time will be `TBD`. This exception may carry `publicAccess: "unknown"`; preserve that uncertainty and never infer admission or a clock time. Every other activity needs explicit Đà Lạt locality, `publicAccess: "confirmed"`, and page quotes in `evidence` for `title`, `public_access`, locality, and either `starts_at` or both `rrule` and `starts_at_time`. Search and rank this calendar month first; use the small remaining horizon only for genuinely soon plans. Do not use the scout to build a long-range calendar.

Every evidence object includes `fieldPath`, `rawValue`, `evidenceText`, `locator`, and 0–100 `confidence`. Submission fetches the page itself and rejects any quote missing from that page. Outside the documented Lâm Viên exception, it rejects unconfirmed access and approximate one-off schedules. It always rejects private or login-gated social sources, outside/unknown locality, missing verified future dates, incomplete or expired recurring schedules, cancellations, duplicates, and activities below the 97-point threshold.

The first accepted activity from a canonical origin creates an active `manual` source. The daily scout refreshes these sources by resubmitting evidence; the background web crawler deliberately does not crawl them. Stale activities unlist automatically when refreshes stop. A complete submission includes a visual bundle: one visible hero plus 2–4 distinct promo images. Prefer explicitly owner-authorized source media with attribution; otherwise generate event-specific ultra-realistic illustrative media and disclose it as AI-generated in alt text and captions. Missing compliant visual media is a publication blocker. Official media remains reference-only unless a separate owner-authorized media policy permits reuse.

Use this complete shape (replace every value with source-proven facts; do not submit a partial object):

```json
{
  "source": {
    "name": "Owner name",
    "canonicalUrl": "https://owner.example",
    "discoveryUrl": "https://owner.example/events",
    "pagePathPrefix": "/events"
  },
  "activity": {
    "sourceUid": "https://owner.example/events/example",
    "sourceUrl": "https://owner.example/events/example",
    "kind": "workshop",
    "title": "Exact title",
    "description": null,
    "startsAt": "2026-10-03T09:00:00+07:00",
    "endsAt": null,
    "timePrecision": "exact",
    "rrule": null,
    "startsAtTime": null,
    "durationMinutes": null,
    "firstOccurrence": null,
    "rruleUntil": null,
    "locationName": "Đà Lạt",
    "address": "Đà Lạt, Lâm Đồng, Vietnam",
    "latitude": null,
    "longitude": null,
    "organizerName": "Owner name",
    "organizerUrl": "https://owner.example",
    "priceType": null,
    "ticketTiers": null,
    "ticketUrl": "https://owner.example/events/example",
    "reservationRequirement": "required",
    "publicAccess": "confirmed",
    "sourcePublishedAt": null,
    "sourceUpdatedAt": null,
    "eventStatus": "scheduled",
    "evidence": [
      {
        "fieldPath": "title",
        "rawValue": "Exact title",
        "evidenceText": "Exact title",
        "locator": "body",
        "confidence": 100
      },
      {
        "fieldPath": "starts_at",
        "rawValue": "3 Oct 2026, 09:00",
        "evidenceText": "3 Oct 2026, 09:00",
        "locator": "body",
        "confidence": 100
      },
      {
        "fieldPath": "address",
        "rawValue": "Đà Lạt, Lâm Đồng, Vietnam",
        "evidenceText": "Đà Lạt, Lâm Đồng, Vietnam",
        "locator": "body",
        "confidence": 100
      },
      {
        "fieldPath": "public_access",
        "rawValue": "Book now",
        "evidenceText": "Book now",
        "locator": "body",
        "confidence": 100
      }
    ],
    "structuredPayload": {},
    "attributes": {}
  },
  "visuals": {
    "hero": {
      "localPath": "public/images/activity-graph/example-hero.png",
      "title": "Illustrative event hero",
      "altText": "AI-generated illustrative image of the verified event in Đà Lạt",
      "caption": "AI-generated illustrative image by DaLat.app; not an actual event photograph.",
      "provenance": "ai_generated",
      "sourceUrl": null,
      "authorizationUrl": null,
      "authorizationEvidenceText": null
    },
    "promo": [
      {
        "localPath": "public/images/activity-graph/example-promo-1.png",
        "title": "Illustrative event detail",
        "altText": "AI-generated illustrative image of the verified event activity",
        "caption": "AI-generated illustrative image by DaLat.app; not an actual event photograph.",
        "provenance": "ai_generated",
        "sourceUrl": null,
        "authorizationUrl": null,
        "authorizationEvidenceText": null
      },
      {
        "localPath": "public/images/activity-graph/example-promo-2.png",
        "title": "Illustrative event atmosphere",
        "altText": "AI-generated illustrative image of the verified event atmosphere",
        "caption": "AI-generated illustrative image by DaLat.app; not an actual event photograph.",
        "provenance": "ai_generated",
        "sourceUrl": null,
        "authorizationUrl": null,
        "authorizationEvidenceText": null
      }
    ]
  }
}
```
