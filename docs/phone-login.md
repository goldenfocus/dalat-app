# Phone-number login

The sign-in page reads Supabase public Auth settings and offers SMS login only when `external.phone` is true. Email and Google remain available. Vietnamese mobile numbers are normalized to +84; other countries require +country code. Verification uses Supabase SMS OTP and then the existing auth continuation, preserving RSVP intents and onboarding.

## Production activation

Production inspection on 2026-11-16 found phone auth disabled and no SMS provider credentials configured. Do not enable phone auth until a real SMS delivery provider is configured and delivery to a Vietnamese mobile number is verified.

1. Configure an approved, funded SMS provider in Supabase Authentication settings. Keep all provider secrets in Supabase, never frontend code.
2. Verify delivery support and sender requirements for Vietnam. Configure server-side SMS rate limits and abuse protection; the 60-second UI cooldown is only a usability control.
3. Enable phone signup/login. Verify a real +84 sign-in, wrong/expired code handling, resend limits, session persistence and RSVP continuation in Safari and Zalo's browser.
4. Existing email/Google users should keep using that method until an authenticated phone-linking flow is implemented. Matching a phone to an email without ownership verification is intentionally not supported.

Rollback: disable phone auth in Supabase. The UI falls back to email and Google when it next loads.

## Validation

24 focused tests cover normalization, invalid inputs, send failure, SMS verification, resend cooldown, feature availability, and existing safe return paths. Catalog parity covers all 12 locales. Real SMS delivery remains untested until provider setup.
