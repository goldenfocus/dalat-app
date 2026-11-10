# Mobile access repair — 2026-11-10

## Evidence and limits

A reported mobile screenshot showed Cloudflare's block page before the app
loaded. No Ray ID was visible, so that individual request could not be matched
to a rule. The API credential can inspect/edit security configuration but cannot
read zone analytics. After the owner completed dashboard sign-in, the browser
security log was inspected directly.

Live inspection found no zone or account IP/country/ASN access rules and no
custom zone firewall rules. Both Cloudflare Managed and OWASP rulesets were
enabled; Browser Integrity Check was on. A controlled request with
`Python-urllib/3.13` returned HTTP 403 / error 1010, while the same URL with an
iPhone/Zalo browser identifier returned HTTP 200. This reproduces a browser
signature denial, not a Vietnamese-carrier block. It does not identify the
specific request in the submitted screenshot.

The additional Cloudflare HTML cache also returned an English homepage to a
Vietnamese-language request. It forced 300-second storage over origin policy,
without varying by language cookie or Accept-Language. The service worker
served saved page HTML before contacting the network, allowing HTML from an
older deployment to reference obsolete bundles. These are verified cache
hazards; the user's intermittent 404 was not reproduced directly.

The security log supplied stronger evidence: a real iPhone/Zalo request on
VNPT, at 2026-11-10 05:52:36 EST, was blocked on `/auth/deovia/start`
while returning to the Social House language-exchange event. Ray ID
`a584823a1c55281e` matched OWASP rule `949110`, with score 50. All twelve
contributing rules belonged to paranoia levels 2–4; their contributions total
50. The rules included strict character counting in cookies and arguments.
The deployed ruleset had no paranoia overrides, which enables all levels via
the API. This is a confirmed false-positive pattern on the reported journey,
though the original screenshot still cannot be matched to that person.

## Changes

- Set OWASP to Cloudflare's standard PL1 by disabling the PL2, PL3 and PL4
  categories. Kept the existing block action and score threshold 40. All twelve
  false-positive scoring rules from the logged Zalo request are excluded.
- Turned Browser Integrity Check off for the dalat.app zone. Managed WAF,
  OWASP, DDoS protection, authentication and authorization remain in place.
- Changed the two existing Cloudflare anonymous HTML cache rules to bypass
  duplicate edge caching. Vercel/Next ISR continues caching public pages.
  Existing private-workspace bypass remains intact.
- Added `no_failed_next_bundles`: respect origin caching for `/_next/static/`
  successes, but never store HTTP 400–599 responses (status TTL `-1`).
- Service worker v1.0.101 requests public page HTML from the network first.
  Successful public HTML remains an offline fallback. HTTP errors, redirects,
  private/no-store content and non-HTML responses are not retained. An actual
  HTTP denial/404 is returned unchanged, not disguised as a successful page.
- Existing upload-aware update activation is preserved.

Cloudflare cache ruleset: `da5169e0a5da4e9f844d2cbf23482f0e`.
Private before/after configuration snapshots are stored in the operator's
`output/mobile-access-20261110` directory, outside Git. Reverting source code
does not roll back Cloudflare configuration; restore only the corresponding
rule fields if a future measured regression requires it.

## Validation

After the edge changes, the previously denied identifier returns HTTP 200.
An iPhone Safari request with `Accept-Language: vi-VN,vi;q=0.9` now redirects to
`/vi` and renders the Vietnamese homepage; English requests render English.
These pages report `CF-Cache-Status: DYNAMIC`.

`tests/sw-navigation.test.ts` executes the real worker fetch handler against
fresh/stale HTML, offline failures, HTTP 403/404/500, redirects, non-HTML and
private responses. `tests/upload-update-safety.test.ts` checks that deployment
activation still waits for existing uploaders.

Recheck the affected phones on their original network after release. The
operator's successful requests do not certify every carrier or the original
visitor's recovery. If blocked again, obtain the complete Cloudflare Ray ID,
time/timezone, URL and browser, then inspect the matching security event before
changing any managed rules.

References: [Cloudflare error 1010](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/),
[Browser Integrity Check](https://developers.cloudflare.com/waf/tools/browser-integrity-check/),
[cache rule TTL semantics](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/),
[OWASP API configuration](https://developers.cloudflare.com/waf/managed-rules/reference/owasp-core-ruleset/configure-api/).
