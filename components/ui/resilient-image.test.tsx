import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { ResilientImage } from "./resilient-image";

const optimized = "/cdn-cgi/image/width=1080/https://cdn.dalat.app/event.png";
const original = "https://cdn.dalat.app/event.png";
const props = { src: optimized, fallbackSrc: original, alt: "Live event", loading: "eager" as const };

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("event image recovery", () => {
  it("starts in server HTML, hides the broken-image glyph, then reveals a loaded image", () => {
    render(<ResilientImage {...props} srcSet={`${optimized} 1080w`} fetchPriority="high" />);
    const image = screen.getByAltText("Live event");
    expect(image).toHaveAttribute("srcset", `${optimized} 1080w`);
    expect(image).toHaveAttribute("fetchpriority", "high");
    expect(image).toHaveStyle({ visibility: "hidden" });
    fireEvent.load(image);
    expect(image).not.toHaveStyle({ visibility: "hidden" });
  });

  it("drops all failed responsive candidates and loads the same image's original once", () => {
    render(<ResilientImage {...props} srcSet={`${optimized} 1080w`} sizes="100vw" />);
    const image = screen.getByAltText("Live event");
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", original);
    expect(image).not.toHaveAttribute("srcset");
    expect(image).not.toHaveAttribute("sizes");
    fireEvent.load(image);
    expect(image).toBeVisible();
    fireEvent.error(image);
    expect(screen.queryByAltText("Live event")).toBeNull();
  });

  it("recovers a request that failed before hydration", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<ResilientImage {...props} />);
    const image = container.querySelector("img")!;
    Object.defineProperty(image, "complete", { value: true, configurable: true });
    Object.defineProperty(image, "naturalWidth", { value: 0, configurable: true });
    // Subsequent assignment starts a new network request.
    Object.defineProperty(image, "complete", { get: () => image.getAttribute("src") === optimized });
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, <ResilientImage {...props} />); });
    expect(image).toHaveAttribute("src", original);
    act(() => root.unmount());
  });

  it("recovers a stalled eager request without timing out lazy offscreen images", () => {
    vi.useFakeTimers();
    const view = render(<ResilientImage {...props} />);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByAltText("Live event")).toHaveAttribute("src", original);
    view.rerender(<ResilientImage {...props} src={`${optimized}?next`} loading="lazy" />);
    act(() => { vi.advanceTimersByTime(16000); });
    expect(screen.getByAltText("Live event")).toHaveAttribute("src", `${optimized}?next`);
  });

  it("resets after navigation to a different image and does not retry direct URLs", () => {
    const view = render(<ResilientImage {...props} />);
    fireEvent.error(screen.getByAltText("Live event"));
    fireEvent.error(screen.getByAltText("Live event"));
    view.rerender(<ResilientImage {...props} src="https://example.com/new.jpg" fallbackSrc="https://example.com/new.jpg" />);
    expect(screen.getByAltText("Live event")).toHaveAttribute("src", "https://example.com/new.jpg");
    fireEvent.error(screen.getByAltText("Live event"));
    expect(screen.queryByAltText("Live event")).toBeNull();
  });
});
