import { describe, expect, it } from "vitest";
import { signClaim, verifyClaim } from "./claim";
describe("practice receipt recovery", () => {
  it("only restores the signed participant in the signed event", () => {
    const token = signClaim("event-a", "person-a", "test-secret", 1000);
    expect(verifyClaim(token, "event-a", "test-secret", 1001)).toBe("person-a");
    expect(verifyClaim(token, "event-b", "test-secret", 1001)).toBeNull();
    expect(verifyClaim(token, "event-a", "wrong-secret", 1001)).toBeNull();
    expect(verifyClaim(token, "event-a", "test-secret", 7 * 3600_000)).toBeNull();
    expect(verifyClaim("bad." + token.split(".")[1], "event-a", "test-secret", 1001)).toBeNull();
    expect(verifyClaim(token + ".extra", "event-a", "test-secret", 1001)).toBeNull();
  });
});
