// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  peopleEventSchema,
  peoplePauseSchema,
  peopleProfileSchema,
  peopleReportSchema,
  peopleReviewSchema,
  personTargetSchema,
} from "./schema";
import { readPeopleBody } from "./http";

const ID = "71000000-0000-4000-8000-000000000001";
const profile = {
  enabled: true,
  intentions: ["friendship"],
  interests: ["coffee"],
  languages: ["en"],
  help_offered: "",
  help_wanted: "",
  source_locale: null,
};

describe("People input boundaries", () => {
  it("allows optional help text and a source language awaiting detection", () => {
    expect(peopleProfileSchema.safeParse(profile).success).toBe(true);
  });

  it.each([
    { intentions: ["romance"] },
    { interests: ["not_a_catalog_key"] },
    { languages: ["zz"] },
    { source_locale: "zz" },
  ])("rejects unsupported or deferred options: %j", (invalid) => {
    expect(peopleProfileSchema.safeParse({ ...profile, ...invalid }).success).toBe(false);
  });

  it.each([
    { intentions: ["friendship", "friendship"] },
    { interests: ["coffee", "coffee"] },
    { languages: ["en", "en"] },
  ])("rejects duplicate option arrays: %j", (invalid) => {
    expect(peopleProfileSchema.safeParse({ ...profile, ...invalid }).success).toBe(false);
  });

  it("bounds profile and report text without requiring people to fill it", () => {
    expect(peopleProfileSchema.safeParse({ ...profile, help_offered: "x".repeat(500), help_wanted: "y".repeat(500) }).success).toBe(true);
    expect(peopleProfileSchema.safeParse({ ...profile, help_offered: "x".repeat(501) }).success).toBe(false);
    expect(peopleProfileSchema.safeParse({ ...profile, help_wanted: "x".repeat(501) }).success).toBe(false);
    expect(peopleReportSchema.safeParse({ user_id: ID, reason: "other", details: "x".repeat(1000) }).success).toBe(true);
    expect(peopleReportSchema.safeParse({ user_id: ID, reason: "other", details: "x".repeat(1001) }).success).toBe(false);
  });

  it("requires UUIDs for person, event and report targets", () => {
    for (const id of ["not-a-uuid", "", "someone@example.invalid"]) {
      expect(personTargetSchema.safeParse({ user_id: id }).success).toBe(false);
      expect(peopleEventSchema.safeParse({ event_id: id }).success).toBe(false);
      expect(peopleReviewSchema.safeParse({ id, status: "reviewed" }).success).toBe(false);
    }
    expect(personTargetSchema.safeParse({ user_id: ID }).success).toBe(true);
    expect(peopleEventSchema.safeParse({ event_id: ID }).success).toBe(true);
  });

  it("keeps pause narrowly scoped and rejects changes to authority or identity", () => {
    expect(peoplePauseSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(peoplePauseSchema.safeParse({ enabled: true }).success).toBe(false);
    expect(peoplePauseSchema.safeParse({ enabled: false, help_offered: "overwrite" }).success).toBe(false);
    expect(peopleProfileSchema.safeParse({ ...profile, user_id: ID }).success).toBe(false);
    expect(peopleReportSchema.safeParse({ user_id: ID, reason: "spam", status: "reviewed" }).success).toBe(false);
    expect(peopleReviewSchema.safeParse({ id: ID, status: "reviewed", details: "replace evidence" }).success).toBe(false);
  });
});

describe("People bounded JSON parsing", () => {
  function request(body: string, headers: Record<string, string> = {}) {
    return new Request("https://dalat.app/api/people/profile", {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body,
    });
  }

  it("parses a normal body and rejects malformed JSON", async () => {
    await expect(readPeopleBody(request(JSON.stringify(profile)))).resolves.toEqual(profile);
    await expect(readPeopleBody(request("{broken"))).resolves.toBeNull();
  });

  it("enforces byte length for multibyte content without trusting Content-Length", async () => {
    const body = JSON.stringify({ text: "é".repeat(6100) });
    expect(body.length).toBeLessThan(12000);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(12000);
    await expect(readPeopleBody(request(body, { "content-length": "10" }))).resolves.toBeNull();
  });

  it("cancels a chunked request once the byte budget is crossed", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(12001));
      },
      cancel() { cancelled = true; },
    });
    const streamed = new Request("https://dalat.app/api/people/profile", {
      method: "POST", headers: { "content-type": "application/json" },
      body: stream, duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(readPeopleBody(streamed)).resolves.toBeNull();
    expect(cancelled).toBe(true);
  });
});
