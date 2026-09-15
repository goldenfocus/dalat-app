import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { transcribe, structureExperience } from "./provider";
import { emptyStory, saveSchema, audioFormat } from "./schema";
const id = "00000000-0000-4000-8000-000000000001";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("experience provider boundaries", () => {
  it("uses a compilable structural wire schema while enforcing bounds locally", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only");
    const fetch = vi.fn().mockResolvedValue(Response.json({
      choices: [{ message: { content: JSON.stringify({
        ...emptyStory("en"), title: "x".repeat(161),
      }) } }],
    }));
    vi.stubGlobal("fetch", fetch);
    await expect(structureExperience("My lunch", "en", "2026-09-13", []))
      .rejects.toThrow();
    const schema = JSON.parse(fetch.mock.calls[0][1].body)
      .response_format.json_schema.schema;
    expect(schema.properties.title).toEqual({ type: "string" });
    expect(schema.required).toContain("title");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.category.enum).toContain("food");
    expect(JSON.stringify(schema)).not.toMatch(/maxLength|maxItems|minimum|pattern|format/);
  });
  it("negotiates actual Safari/Chrome audio formats", () => {
    expect(audioFormat("audio/mp4;codecs=mp4a.40.2")).toBe("m4a");
    expect(audioFormat("audio/webm;codecs=opus")).toBe("webm");
    expect(audioFormat("text/plain")).toBeUndefined();
  });
  it("fails closed without a key, without calling another provider", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(transcribe("data", "m4a")).rejects.toThrow(
      "provider_unavailable",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends base64 audio to the dedicated endpoint and validates text", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ text: "A quiet lunch.", usage: { cost: 0.001 } }),
      );
    vi.stubGlobal("fetch", fetch);
    expect((await transcribe("YXVkaW8=", "m4a")).text).toBe("A quiet lunch.");
    expect(fetch.mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/v1/audio/transcriptions",
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body).input_audio).toEqual({
      data: "YXVkaW8=",
      format: "m4a",
    });
  });
  it("rejects empty transcription and never returns upstream errors", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ text: "" })),
    );
    await expect(transcribe("x", "webm")).rejects.toThrow();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { message: "secret upstream detail" } },
            { status: 401 },
          ),
        ),
    );
    await expect(transcribe("x", "webm")).rejects.toThrow("provider_failed");
  });
  it("keeps grounded context and removes fabricated source anchors", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only");
    const source = "It was noisy on Tuesday evening.";
    const observed = {
      subject: "noise",
      value: "Noisy",
      context: "Tuesday evening",
      source_type: "impression",
      evidence: source,
      confidence: 0.8,
    };
    const draft = {
      ...emptyStory("en"),
      observations: [
        observed,
        { ...observed, value: "Always noisy", evidence: "an invented quote" },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [{ message: { content: JSON.stringify(draft) } }],
        }),
      ),
    );
    const result = await structureExperience(source, "en", "2026-09-12", []);
    expect(result.story.observations).toHaveLength(1);
    expect(result.story.observations[0].context).toBe("Tuesday evening");
  });
  it("rejects model-selected photo IDs that were not submitted", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only");
    const draft = {
      ...emptyStory("en"),
      photos: [{ id, alt: "Invented photograph", caption: "" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [{ message: { content: JSON.stringify(draft) } }],
        }),
      ),
    );
    await expect(
      structureExperience("My lunch", "en", "2026-09-12", []),
    ).rejects.toThrow("invalid_photo");
  });
  it("rejects malformed draft contracts rather than writing unchecked data", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [{ message: { content: '{"title": "Incomplete"}' } }],
        }),
      ),
    );
    await expect(
      structureExperience("My lunch", "en", "2026-09-12", []),
    ).rejects.toThrow();
  });
  it("does not accept unsupported canonical locales or impossible dates", () => {
    const input = {
      ...emptyStory("en"),
      visit_date: "2026-02-30",
      venue_id: null,
      selected_media: [],
      venue_confirmed: false,
      permission_confirmed: false,
      sponsorship: "",
    };
    expect(saveSchema.safeParse(input).success).toBe(false);
    expect(
      saveSchema.safeParse({
        ...input,
        visit_date: "2026-09-12",
        original_language: "English",
      }).success,
    ).toBe(false);
  });
});
