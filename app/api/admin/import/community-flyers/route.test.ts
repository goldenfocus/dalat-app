import { describe, expect, it } from "vitest";
import { GET, PATCH } from "./route";

describe("retired flyer submission endpoint", () => {
  it.each([GET, PATCH])(
    "returns 410 without exposing an action",
    async (handler) => {
      const response = await handler();
      expect(response.status).toBe(410);
      await expect(response.json()).resolves.toEqual({
        code: "legacy_submission_retired",
      });
    },
  );
});
