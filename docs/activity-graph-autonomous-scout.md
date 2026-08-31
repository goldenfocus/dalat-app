# Autonomous Activity Scout submission contract

The daily activity scout may publish a finding only by sending JSON to `npm run activity-graph:submit-scout`.

Each object is `{ "source": { ... }, "activity": { ... } }`. All source URLs must be canonical first-party HTTPS URLs on one origin. An activity needs a future exact ISO start time, explicit Đà Lạt address or coordinates, `publicAccess: "confirmed"`, and page quotes in `evidence` for `title`, `starts_at`, `public_access`, and `address` or `location_name`.

Every evidence object includes `fieldPath`, `rawValue`, `evidenceText`, `locator`, and 0–100 `confidence`. Submission fetches the page itself and rejects any quote missing from that page. It also rejects private or login-gated social sources, unconfirmed access, outside/unknown locality, past or approximate schedules, cancellations, duplicates, and activities below the 97-point threshold.

The first accepted activity from a canonical origin creates an active `manual` source. The daily scout refreshes these sources by resubmitting evidence; the background web crawler deliberately does not crawl them. Stale activities unlist automatically when refreshes stop. Official media remains reference-only unless a separate owner-authorized media policy permits reuse.

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
      {"fieldPath":"title","rawValue":"Exact title","evidenceText":"Exact title","locator":"body","confidence":100},
      {"fieldPath":"starts_at","rawValue":"3 Oct 2026, 09:00","evidenceText":"3 Oct 2026, 09:00","locator":"body","confidence":100},
      {"fieldPath":"address","rawValue":"Đà Lạt, Lâm Đồng, Vietnam","evidenceText":"Đà Lạt, Lâm Đồng, Vietnam","locator":"body","confidence":100},
      {"fieldPath":"public_access","rawValue":"Book now","evidenceText":"Book now","locator":"body","confidence":100}
    ],
    "structuredPayload": {},
    "attributes": {}
  }
}
```
