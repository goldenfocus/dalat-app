import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeBearerSecret } from "./bearer-authorization";

function requestWith(header: string | null) {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request("http://localhost/api/import/scout", { headers });
}

describe("authorizeBearerSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed with 503 when the secret is unset", () => {
    vi.stubEnv("SCOUT_INGEST_KEY", "");
    const result = authorizeBearerSecret(requestWith("Bearer test-key"), "SCOUT_INGEST_KEY");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });

  it("rejects a missing Authorization header", () => {
    vi.stubEnv("SCOUT_INGEST_KEY", "test-key");
    const result = authorizeBearerSecret(requestWith(null), "SCOUT_INGEST_KEY");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects a wrong bearer token", () => {
    vi.stubEnv("SCOUT_INGEST_KEY", "test-key");
    const result = authorizeBearerSecret(
      requestWith("Bearer other-key"),
      "SCOUT_INGEST_KEY",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("ignores cookie-looking headers and requires Bearer", () => {
    vi.stubEnv("SCOUT_INGEST_KEY", "test-key");
    const request = new Request("http://localhost/api/import/scout", {
      headers: { cookie: "sb-access-token=test-key" },
    });
    const result = authorizeBearerSecret(request, "SCOUT_INGEST_KEY");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("accepts the configured Bearer secret", () => {
    vi.stubEnv("SCOUT_INGEST_KEY", "test-key");
    const result = authorizeBearerSecret(
      requestWith("Bearer test-key"),
      "SCOUT_INGEST_KEY",
    );
    expect(result.ok).toBe(true);
  });
});
