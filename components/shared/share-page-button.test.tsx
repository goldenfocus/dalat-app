import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SharePageButton } from "./share-page-button";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/haptics", () => ({ triggerHaptic: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shares only the canonical listing URL through the native share action", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share });
  const url = "https://dalat.app/vi/rentals/listing/example";
  render(<SharePageButton url={url} />);
  const button = screen.getByRole("button", { name: "share" });
  expect(button.textContent).toBe("");
  fireEvent.click(button);
  await waitFor(() => expect(share).toHaveBeenCalledWith({ url }));
});
