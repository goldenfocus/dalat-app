import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserAvatar } from "./user-avatar";
import { optimizedImageUrl, imagePresets } from "@/lib/image-cdn";

// Exercise Radix's real off-DOM preloader, including errors before an img mounts.
class TestImage extends EventTarget {
  static requests: TestImage[] = [];
  src = "";
  complete = false;
  naturalWidth = 0;
  constructor() {
    super();
    TestImage.requests.push(this);
  }
  finish(type: "load" | "error") {
    this.complete = true;
    this.naturalWidth = type === "load" ? 192 : 0;
    act(() => { this.dispatchEvent(new Event(type)); });
  }
}

const src = "https://cdn.dalat.app/avatars/person/photo.jpg";
const optimized = optimizedImageUrl(src, imagePresets.avatar);
const latest = () => TestImage.requests[TestImage.requests.length - 1];

beforeEach(() => {
  TestImage.requests = [];
  vi.stubGlobal("Image", TestImage);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("profile avatar image delivery", () => {
  it("loads the small optimized image and crops it to the avatar", () => {
    render(<UserAvatar src={src} alt="Yan Lovez" />);
    expect(latest().src).toBe(optimized);
    latest().finish("load");
    expect(screen.getByRole("img", { name: "Yan Lovez" }))
      .toHaveAttribute("src", optimized);
    expect(screen.getByRole("img")).toHaveClass("object-cover");
  });

  it("recovers a failed optimized request using the original photo", () => {
    render(<UserAvatar src={src} alt="Yan Lovez" />);
    latest().finish("error");
    expect(latest().src).toBe(src);
    latest().finish("load");
    expect(screen.getByRole("img")).toHaveAttribute("src", src);
    expect(TestImage.requests).toHaveLength(2);
  });

  it("shows initials if both requests fail without a broken image or retry loop", () => {
    render(<UserAvatar src={src} alt="Yan Lovez" />);
    latest().finish("error");
    latest().finish("error");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("YL")).toBeVisible();
    expect(TestImage.requests).toHaveLength(2);
  });

  it("tries optimization again when the user changes their photo", () => {
    const view = render(<UserAvatar src={src} alt="Yan Lovez" />);
    latest().finish("error");
    latest().finish("error");
    const nextSrc = "https://cdn.dalat.app/avatars/person/new.jpg";
    view.rerender(<UserAvatar src={nextSrc} alt="Yan Lovez" />);
    expect(latest().src).toBe(optimizedImageUrl(nextSrc, imagePresets.avatar));
    latest().finish("load");
    expect(screen.getByRole("img")).toHaveAttribute("src", latest().src);
  });

  it("does not retry an unoptimized external photo in a loop", () => {
    render(<UserAvatar src="https://example.com/photo.jpg" alt="Yan Lovez" />);
    latest().finish("error");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("YL")).toBeVisible();
    expect(TestImage.requests).toHaveLength(1);
  });

  it("shows a profile icon when no photo or name is available", () => {
    const { container } = render(<UserAvatar src={null} />);
    expect(TestImage.requests).toHaveLength(0);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("restores the fallback when a previously loaded photo is removed", () => {
    const view = render(<UserAvatar src={src} alt="Yan Lovez" />);
    latest().finish("load");
    expect(screen.getByRole("img")).toBeInTheDocument();
    view.rerender(<UserAvatar src={null} alt="Yan Lovez" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("YL")).toBeVisible();
  });
});
