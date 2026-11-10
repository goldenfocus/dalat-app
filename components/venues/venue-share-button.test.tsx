import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { VenueShareButton } from "./venue-share-button";
import { localeUrl } from "@/lib/i18n/locale-url";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/haptics", () => ({ triggerHaptic: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const urls = [
  localeUrl("en", "/tamcitta"),
  localeUrl("vi", "/tamcitta"),
  localeUrl("de", "/social-house-dalat"),
];

function setup(url: string, nativeShare?: ReturnType<typeof vi.fn>) {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share: nativeShare, clipboard: { writeText } });
  render(<VenueShareButton url={url} label="Chia sẻ" />);
  return { writeText };
}

describe("venue sharing", () => {
  it("preserves metadata for existing organizer callers", async () => {
    const nativeShare = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: nativeShare });
    render(<VenueShareButton name="Organizer" shareText="About the organizer" url={urls[0]} label="Share" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(nativeShare).toHaveBeenCalledWith({
      title: "Organizer — ĐàLạt.app",
      text: "About the organizer",
      url: urls[0],
    }));
  });

  it.each(urls)("sends only %s to the native share sheet", async (url) => {
    const nativeShare = vi.fn().mockResolvedValue(undefined);
    const { writeText } = setup(url, nativeShare);
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));
    await waitFor(() => expect(nativeShare).toHaveBeenCalledWith({ url }));
    // Receivers such as Zalo may concatenate every supplied field. There must
    // be exactly one value, so no title/domain/second URL can be pasted.
    expect(Object.values(nativeShare.mock.calls[0][0]).join("")).toBe(url);
    expect(new URL(url).origin).toBe("https://dalat.app");
    expect(url.match(/https:\/\//g)).toHaveLength(1);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies exactly one localized URL when native sharing is unavailable", async () => {
    const { writeText } = setup(urls[1]);
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(urls[1]));
  });

  it("copies exactly one URL if native sharing fails", async () => {
    const { writeText } = setup(urls[1], vi.fn().mockRejectedValue(new Error("Unavailable")));
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(urls[1]));
  });

  it("does not copy anything when the user cancels the share sheet", async () => {
    const nativeShare = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    const { writeText } = setup(urls[1], nativeShare);
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));
    await waitFor(() => expect(nativeShare).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
  });

  it("keeps Copy link as a direct single-URL copy", async () => {
    const nativeShare = vi.fn();
    const { writeText } = setup(urls[1], nativeShare);
    fireEvent.click(screen.getByRole("button", { name: "copyLink" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(urls[1]));
    expect(nativeShare).not.toHaveBeenCalled();
  });
});
