import { expect, it } from "vitest";
import { withinRegistrationCutoff } from "./sponsorship";
const cutoff = "2026-11-04T16:00:00+07:00";
it("qualifies early registrations even when the drink is claimed later", () => {
 expect(withinRegistrationCutoff("2026-11-04T15:59:59+07:00", cutoff)).toBe(true);
});
it("excludes the exact deadline and late registrations regardless of rank", () => {
 expect(withinRegistrationCutoff("2026-11-04T16:00:00+07:00", cutoff)).toBe(false);
 expect(withinRegistrationCutoff("2026-11-04T09:00:01Z", cutoff)).toBe(false);
});
it("leaves campaigns without a cutoff unchanged, but fails closed on missing evidence", () => {
 expect(withinRegistrationCutoff(null, null)).toBe(true);
 expect(withinRegistrationCutoff(null, cutoff)).toBe(false);
 expect(withinRegistrationCutoff("invalid", cutoff)).toBe(false);
});
