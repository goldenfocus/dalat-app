import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppFreshnessHandler,
  LIVE_DATA_REFRESH_INTERVAL_MS,
  isLiveDataPath,
} from "./app-freshness-handler";

const refresh = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => pathname,
}));

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
    expect(isLiveDataPath("/fr/map")).toBe(true);
    expect(isLiveDataPath("/venues/some-venue")).toBe(true);
  });

  it("does not interrupt forms or unrelated pages", () => {
    expect(isLiveDataPath("/events/new")).toBe(false);
    expect(isLiveDataPath("/vi/events/some-event/edit")).toBe(false);
    expect(isLiveDataPath("/settings")).toBe(false);
    expect(isLiveDataPath("/blog/a-story")).toBe(false);
  });
});

describe("AppFreshnessHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
    pathname = "/";
    setVisibility("visible");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes when an open PWA returns from the background", () => {
    render(<AppFreshnessHandler />);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes lifecycle data every minute while visible", () => {
    render(<AppFreshnessHandler />);

    act(() => {
      vi.advanceTimersByTime(LIVE_DATA_REFRESH_INTERVAL_MS);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not poll while the app is hidden", () => {
    setVisibility("hidden");
    render(<AppFreshnessHandler />);

    act(() => {
      vi.advanceTimersByTime(LIVE_DATA_REFRESH_INTERVAL_MS * 2);
    });

    expect(refresh).not.toHaveBeenCalled();
  });

  it("reconciles an installed PWA shortly after its cached first paint", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    render(<AppFreshnessHandler />);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not add a duplicate launch refresh after client navigation", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const view = render(<AppFreshnessHandler />);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    pathname = "/events/another-event";
    view.rerender(<AppFreshnessHandler />);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
