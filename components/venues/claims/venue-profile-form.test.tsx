import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/i18n/routing", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("@/lib/storage/client", () => ({ uploadFile: vi.fn() }));
import { VenueProfileForm } from "./venue-profile-form";
const venue = { id: "venue", slug: "social-house", name: "Social House", description: "Venue description", phone: "", email: "", website_url: "", facebook_url: "", instagram_url: "", logo_url: "", operating_hours: null };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("saves a venue with blank optional contact fields as null", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetcher);
  render(<VenueProfileForm venue={venue} />);
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await screen.findByText("saved");
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body).toMatchObject({ name: "Social House", email: null, phone: null, website_url: null, description: venue.description });
});
it("recovers the save button after a network error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<VenueProfileForm venue={venue} />);
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await screen.findByText("failed");
  await waitFor(() => expect(screen.getByRole("button", { name: "save" })).not.toBeDisabled());
});
