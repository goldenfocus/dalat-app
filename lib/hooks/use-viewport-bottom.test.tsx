import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewportBottom } from "./use-viewport-bottom";

function Footer({ enabled = true }) {
  const ref = useRef<HTMLElement>(null);
  useViewportBottom(ref, enabled);
  return <nav ref={ref} aria-label="Primary" />;
}

let viewport: EventTarget & { height: number; offsetTop: number; scale: number };
let layoutBottom: number;
let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  viewport = Object.assign(new EventTarget(), { height: 852, offsetTop: 0, scale: 1 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  layoutBottom = 852;
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { bottom: layoutBottom - (parseFloat(this.style.bottom) || 0) } as DOMRect;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const settle = () => act(() => { vi.advanceTimersByTime(20); });

describe("mobile footer anchoring", () => {
  it("corrects a footer stranded above the bottom during touch scrolling without moving the page", () => {
    render(<Footer />);
    settle();
    const nav = screen.getByRole("navigation");
    expect(nav.style.bottom).toBe("");
    // Reproduce the stale viewport in the supplied iPhone screenshot.
    layoutBottom = 630;
    window.dispatchEvent(new Event("scroll"));
    settle();
    expect(nav.getBoundingClientRect().bottom).toBe(852);
    viewport.dispatchEvent(new Event("scroll"));
    settle();
    expect(nav.style.bottom).toBe("-222px");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("follows keyboard, toolbar and orientation changes without accumulating corrections", () => {
    render(<Footer />);
    settle();
    const nav = screen.getByRole("navigation");
    viewport.height = 520;
    viewport.offsetTop = 20;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(nav.getBoundingClientRect().bottom).toBe(540);
    viewport.height = 852;
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(nav.getBoundingClientRect().bottom).toBe(852);
    layoutBottom = viewport.height = 393;
    window.dispatchEvent(new Event("resize"));
    settle();
    expect(nav.getBoundingClientRect().bottom).toBe(393);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("leaves pinch zoom to the browser and restores anchoring afterward", () => {
    render(<Footer />);
    settle();
    viewport.scale = 2;
    viewport.height = 426;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(screen.getByRole("navigation").style.bottom).toBe("");
    viewport.scale = 1;
    viewport.height = 852;
    layoutBottom = 700;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(screen.getByRole("navigation").getBoundingClientRect().bottom).toBe(852);
  });

  it("cleans up adjustments when navigation is hidden", () => {
    const view = render(<Footer />);
    layoutBottom = 600;
    settle();
    expect(screen.getByRole("navigation").style.bottom).toBe("-252px");
    view.rerender(<Footer enabled={false} />);
    expect(screen.getByRole("navigation").style.bottom).toBe("");
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(screen.getByRole("navigation").style.bottom).toBe("");
  });
});
