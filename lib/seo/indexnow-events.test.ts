import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventIndexingReadiness } from "@/lib/translations-readiness";

const {
  getEventReadinessMock,
  getEventsReadinessMock,
  pingIndexNowMock,
} = vi.hoisted(() => ({
  getEventReadinessMock: vi.fn(),
  getEventsReadinessMock: vi.fn(),
  pingIndexNowMock: vi.fn(),
}));

vi.mock("@/lib/translations-readiness", () => ({
  getEventIndexingReadiness: getEventReadinessMock,
  getEventsIndexingReadiness: getEventsReadinessMock,
}));

vi.mock("./indexnow", () => ({
  pingIndexNow: pingIndexNowMock,
}));

import { notifyEventTranslationCompletion } from "./indexnow-events";

const readiness = {
  eventId: "event-1",
  slug: "flower-festival-2026",
  sourceLocale: "en",
  published: true,
  contentReady: true,
  content: {
    ready: true,
    blockingIssues: [],
    warnings: [],
    ogImageFallbackPath: "/events/flower-festival-2026/og-image",
  },
  requiredFields: ["title", "description"],
  locales: [],
  readyLocales: ["en", "vi"],
  readyPaths: [
    "/events/flower-festival-2026",
    "/vi/events/flower-festival-2026",
  ],
  allLocalesReady: false,
  lastModified: "2026-08-27T12:00:00.000Z",
} satisfies EventIndexingReadiness;

describe("event translation completion notification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CACHE_REVALIDATE_SECRET", "");
    vi.stubEnv("CRON_SECRET", "");
    getEventsReadinessMock.mockResolvedValue(new Map([[readiness.eventId, readiness]]));
    pingIndexNowMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("submits ready URLs directly when no callback secret is available", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await notifyEventTranslationCompletion({} as never, ["event-1"]);

    expect(result).toEqual({ via: "direct-indexnow", eventCount: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pingIndexNowMock).toHaveBeenCalledWith(readiness.readyPaths);
  });

  it("uses CRON_SECRET for the production cache-refresh callback", async () => {
    vi.stubEnv("CRON_SECRET", "worker-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dalat.app");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [{ event_id: "event-1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await notifyEventTranslationCompletion({} as never, ["event-1"]);

    expect(result).toEqual({ via: "app-callback", eventCount: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dalat.app/api/translate",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer worker-secret" }),
      })
    );
    expect(pingIndexNowMock).not.toHaveBeenCalled();
  });

  it("falls back to direct readiness-filtered submission when callback fails", async () => {
    vi.stubEnv("CRON_SECRET", "worker-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await notifyEventTranslationCompletion({} as never, ["event-1"]);

    expect(result).toEqual({ via: "direct-indexnow", eventCount: 1 });
    expect(pingIndexNowMock).toHaveBeenCalledWith(readiness.readyPaths);
  });
});
