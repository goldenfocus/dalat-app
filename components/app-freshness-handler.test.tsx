import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMomentUploadActive } from '@/lib/uploads/activity';
import {
  AppFreshnessHandler,
  LIVE_DATA_REFRESH_INTERVAL_MS,
  UNCACHED_ROUTE_REFRESH_MS,
  isLiveDataPath,
} from "./app-freshness-handler";

const refresh = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => pathname,
}));

const probe = vi.fn();

/** The server's answer to the freshness probe; `age` in seconds, `null` for a per-request route. */
function serverCopy(age: number | null) {
  probe.mockImplementation(async () =>
    new Response(null, {
      headers: age === null ? {} : { age: String(age), "x-nextjs-prerender": "1" },
    })
  );
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function returnFromBackground() {
  setVisibility("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  setVisibility("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  return advance(0);
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

describe("isLiveDataPath", () => {
  it("covers localized discovery pages", () => {
    expect(isLiveDataPath("/")).toBe(true);
    expect(isLiveDataPath("/vi")).toBe(true);
    expect(isLiveDataPath("/events/some-event")).toBe(true);
    expect(isLiveDataPath("/events/upcoming")).toBe(true);
    expect(isLiveDataPath("/vi/events/upcoming/2")).toBe(true);
    expect(isLiveDataPath("/fr/map")).toBe(true);
    expect(isLiveDataPath("/venues/some-venue")).toBe(true);
  });

  it("does not interrupt forms or unrelated pages", () => {
    expect(isLiveDataPath("/events/new")).toBe(false);
    expect(isLiveDataPath("/vi/events/some-event/edit")).toBe(false);
    expect(isLiveDataPath("/vi/events/some-event/arrive")).toBe(false);
    expect(isLiveDataPath("/events/some-event/host")).toBe(false);
    expect(isLiveDataPath("/settings")).toBe(false);
    expect(isLiveDataPath("/blog/a-story")).toBe(false);
  });
});

describe("AppFreshnessHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
    probe.mockReset();
    vi.stubGlobal("fetch", probe);
    serverCopy(0);
    setOnline(true);
    setMomentUploadActive(false);
    pathname = "/";
    window.history.replaceState(null, "", "/");
    setVisibility("visible");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refreshes when an open PWA returns from the background", async () => {
    render(<AppFreshnessHandler />);

    await returnFromBackground();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes lifecycle data within a minute of the server copy changing", async () => {
    serverCopy(10);
    render(<AppFreshnessHandler />);

    await advance(LIVE_DATA_REFRESH_INTERVAL_MS);

    expect(probe).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/" }),
      expect.objectContaining({ method: "HEAD" })
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not re-download a page the server has not regenerated", async () => {
    serverCopy(3_600);
    render(<AppFreshnessHandler />);

    await advance(LIVE_DATA_REFRESH_INTERVAL_MS * 3);

    expect(probe).toHaveBeenCalledTimes(3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("re-fetches a per-request route no more often than cached pages regenerate", async () => {
    serverCopy(null);
    render(<AppFreshnessHandler />);

    await advance(UNCACHED_ROUTE_REFRESH_MS - LIVE_DATA_REFRESH_INTERVAL_MS);
    expect(refresh).not.toHaveBeenCalled();
    // One probe to learn the route is uncached, none while waiting.
    expect(probe).toHaveBeenCalledTimes(1);

    await advance(LIVE_DATA_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("never re-fetches over a connection that fails the probe", async () => {
    probe.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<AppFreshnessHandler />);

    await returnFromBackground();
    window.dispatchEvent(new Event("online"));
    await advance(LIVE_DATA_REFRESH_INTERVAL_MS);

    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not probe while the browser reports being offline", async () => {
    setOnline(false);
    render(<AppFreshnessHandler />);

    await advance(LIVE_DATA_REFRESH_INTERVAL_MS);

    expect(probe).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not poll while the app is hidden", async () => {
    setVisibility("hidden");
    render(<AppFreshnessHandler />);

    await advance(LIVE_DATA_REFRESH_INTERVAL_MS * 2);

    expect(probe).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not refresh an active upload when the phone resumes or a minute elapses', async () => {
    setMomentUploadActive(true);
    render(<AppFreshnessHandler />);
    await returnFromBackground();
    await advance(LIVE_DATA_REFRESH_INTERVAL_MS);
    expect(refresh).not.toHaveBeenCalled();
    setMomentUploadActive(false);
    await advance(LIVE_DATA_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reconciles an installed PWA shortly after its cached first paint", async () => {
    // A cached shell can be older than the server copy's age suggests.
    serverCopy(3_600);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    render(<AppFreshnessHandler />);

    await advance(1_000);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not add a duplicate launch refresh after client navigation", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const view = render(<AppFreshnessHandler />);

    await advance(1_000);
    pathname = "/events/another-event";
    window.history.replaceState(null, "", pathname);
    view.rerender(<AppFreshnessHandler />);
    await advance(1_000);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once after a client navigation, which may have painted a prefetched copy", async () => {
    serverCopy(3_600);
    const view = render(<AppFreshnessHandler />);

    pathname = "/events/another-event";
    window.history.replaceState(null, "", pathname);
    view.rerender(<AppFreshnessHandler />);
    await advance(LIVE_DATA_REFRESH_INTERVAL_MS * 2);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
