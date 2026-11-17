# Upload notifications

Uploads continue through the global upload engine, without a fixed queue footer.
The album uploader still provides progress, pause/resume and retry controls.

- Finishing a transfer shows a five-second dismissible toast. Videos still encoding are described as getting ready.
- Once every video in the observed batch is processed, a separate ready toast appears. Pending host approval is never described as published.
- A failed or paused batch has an eight-second dismissible notice linking to its queue. It does not hide the page or navigate automatically.
- Restored successful receipts remain silent; restored processing batches can notify on completion. Repeated polls and route changes do not replay a finished toast.
- The native toast close control is localized and has a 44px touch target. Upload notices stay at the top, away from the mini-player and navigation.

Dismissal removes only the notice. It never cancels transfers, clears durable files, deletes receipts or changes the current route. Browser/phone background limits and server reconciliation remain unchanged.

Verification: `lib/uploads/notices.test.ts`, `components/moments/upload-notifications.test.tsx`, upload server/recovery checks, all 12 catalogs, and browser verification with 21 completed items plus one active/error/processing item.
