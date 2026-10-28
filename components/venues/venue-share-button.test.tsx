import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { VenueShareButton } from "./venue-share-button";
const mocks = vi.hoisted(() => ({ share: vi.fn(), copyText: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/hooks/use-share", () => ({
  useShare: () => ({ ...mocks, copied: false }),
}));
afterEach(cleanup);
describe("venue sharing", () => {
  it("uses the shared native share and explicit clean link copy", () => {
    render(
      <VenueShareButton
        name="Social House Dalat"
        shareText="Social House Dalat"
        url="https://dalat.app/de/social-house-dalat"
        label="Teilen"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Teilen" }));
    expect(mocks.share).toHaveBeenCalledWith({
      title: "Social House Dalat — ĐàLạt.app",
      text: "Social House Dalat",
      url: "https://dalat.app/de/social-house-dalat",
    });
    fireEvent.click(screen.getByRole("button", { name: "copyLink" }));
    expect(mocks.copyText).toHaveBeenCalledWith(
      "https://dalat.app/de/social-house-dalat",
    );
  });
});
