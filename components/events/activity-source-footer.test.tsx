import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { ActivitySourceFooter } from "./activity-source-footer";
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => ({ activitySource: "Source", activityLastConfirmed: "Last confirmed" })[key] }));
afterEach(cleanup);
it("renders the publisher link as footer attribution", async () => {
  render(await ActivitySourceFooter({ locale: "en", sourceMetadata: { source_url: "https://baolamdong.vn/example" }, lastConfirmedAt: "2026-09-08T06:43:08Z" }));
  const link = screen.getByRole("link", { name: "Source: baolamdong.vn" });
  expect(link.closest("footer")).not.toBeNull();
  expect(link).toHaveAttribute("href", "https://baolamdong.vn/example");
  expect(screen.getByText(/Last confirmed/)).toBeInTheDocument();
});
it("omits unsafe source links", async () => {
  expect(await ActivitySourceFooter({ locale: "en", sourceMetadata: { source_url: "javascript:alert(1)" }, lastConfirmedAt: null })).toBeNull();
});
