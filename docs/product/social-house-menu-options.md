# Social House menu and ordering choices

Source: https://socialhousedalat.com/menu/, checked 2026-11-04. The checked menu has 35 priced items plus a quote-only pour-over section. Current item data is in `scripts/data/social-house/menu.json`; the narrow refresh SQL preserves existing item IDs, photos, sold-out flags, and past orders.

Coffee supports hot/iced where listed, plus oat milk (+5,000 VND) and wine-fermented Robusta (+10,000 VND). The Moka Pot section lists the same two upgrades, without a temperature choice. Cookies require a flavour and burritos require kimchi or salad. Do not infer temperature, milk substitutions or prices for other categories. Pour-over must be ordered at the venue because its price is not published.

`option_groups` contains stable `menuOptions` catalog keys, choices, surcharge amounts and optional defaults. All choice/group labels are in the 12 UI catalogs. Menu names/descriptions and section titles/notes remain in the existing content-translation registry, with existing source invalidation and original-text controls. Order snapshots are private operational data and do not enter the public translation queue.

The shared order controls require explicit choices before adding, support multiple configurations of the same item and preserve selected options in the cart. SQL validates each selection against the item's current configuration, computes surcharges and snapshots the final name and price. Both anonymous check-in, signed-in reservations and the legacy preorder sheet use the same options. A complimentary drink covers the base menu price; upgrades remain payable. Existing receipts are not repriced or rewritten.

Validation: menu option unit/UI tests, full Vitest suite, TypeScript, catalog/namespace checks and the disposable PostgreSQL arrival suite. The SQL fixture verifies surcharges, receipt text, variants, retry consistency, unknown/missing choices and sponsorship totals.
