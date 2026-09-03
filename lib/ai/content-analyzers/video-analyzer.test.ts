import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCloudflareTranscript,
  buildVideoAnalysisPrompt,
  parseVTTToText,
} from "./video-analyzer";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("video audio evidence", () => {
  it("uses the Stream credential and downloads actual VTT rather than track metadata", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account\\n");
    vi.stubEnv("CLOUDFLARE_STREAM_API_TOKEN", "stream-token\\n");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "wrong-token");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: [
              { language: "en", status: "inprogress" },
              { language: "vi", label: "Tiếng Việt", status: "ready" },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          "WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nRecorded discussion\n",
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await getCloudflareTranscript("video")).toEqual({
      text: "Recorded discussion",
      language: "vi",
    });
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer stream-token",
    );
    expect(fetcher.mock.calls[1][0]).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account/stream/video/captions/vi/vtt",
    );
  });
  it("leaves missing captions to local speech transcription", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a");
    vi.stubEnv("CLOUDFLARE_STREAM_API_TOKEN", "t");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: [] }))),
    );
    expect(await getCloudflareTranscript("v")).toBeNull();
  });
  it("does not cut off later discussion topics", () => {
    expect(
      buildVideoAnalysisPrompt(`${"earlier ".repeat(1000)}END OF TALK`),
    ).toContain("END OF TALK");
  });
  it("removes VTT cue ids, timestamps and markup", () => {
    expect(
      parseVTTToText(
        "WEBVTT\n\n23\n00:00:01.000 --> 00:00:04.000\n<v speaker>Hello</v>\n",
      ),
    ).toBe("Hello");
  });
});
