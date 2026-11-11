import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DrinkOfferSettings } from "./drink-offer-settings";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("lets a manager remove a hidden selection while saving the current event", async () => {
 const fetcher = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetcher);
 render(<DrinkOfferSettings slug="event" limit={100} menu={[]} itemIds={["hidden-item"]} onSaved={vi.fn().mockResolvedValue(undefined)} />);
 fireEvent.click(screen.getByRole("checkbox"));
 fireEvent.click(screen.getByRole("button", { name: "saveLimit" }));
 await waitFor(() => expect(fetcher).toHaveBeenCalled());
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ limit: 100, itemIds: [] });
});
