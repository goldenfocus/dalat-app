# Live events in the Events tab

The Events tab redirects to `/events/upcoming`. It now lists events that are still running as well as future events. A Happening Now section appears above Upcoming; the section titles reuse the existing localized home labels, while listing metadata/count/empty-state copy supports all 12 locales.

Selection uses `starts_at > now OR ends_at > now OR (ends_at IS NULL AND starts_at > now - 4 hours)`, with the existing published/public visibility filters. An explicit end always takes precedence. The four-hour fallback applies only when no end is recorded. An event is live at its start, and drops out at its end.

Current/future filtering happens before recurring-show grouping and pagination. A live occurrence represents its series, with remaining dates retained in the existing more-dates link. Live choices sort first so a later occurrence cannot replace the event currently running.

The existing AppFreshnessHandler already covers the Events route: refresh on return, reconnect, PWA launch and every visible minute. No second polling loop is added. Tests cover start/end boundaries, null ends, long events, recurring live/future grouping, ordering ahead of pagination and route refresh coverage.
