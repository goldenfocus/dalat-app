import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { FloatingRsvpBar } from "./floating-rsvp-bar";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./rsvp-button", () => ({
  useCelebration: () => ({ isRsvpCardVisible: false, isCelebrating: false }),
  isEventPast: () => false,
  useRsvpActions: () => ({ confirmedStatus: "going" }),
}));
vi.mock("./community-rsvp", () => ({ CommunityRsvpChoice: () => null }));
vi.mock("./rsvp-celebration", () => ({ RsvpCelebration: () => null }));
vi.mock("@/components/questionnaire", () => ({ QuestionnaireFlow: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState(null, "", "/"); });

const props = { arrivalEnabled: true, eventId: "event", eventSlug: "exchange", eventTitle: "Exchange", eventDescription: null, eventImageUrl: null, capacity: null, goingSpots: 1, currentRsvp: null, isLoggedIn: true, waitlistPosition: null, startsAt: "2099-11-04T11:00:00Z", endsAt: null };

it.each(["/events/exchange", "/vi/events/exchange"])("keeps the saved-drink action in the sticky mobile bar at %s", path => {
  window.history.replaceState(null, "", path);
  render(<NextIntlClientProvider locale="en" messages={messages}>
    <FloatingRsvpBar {...props} drinkSelection={{ items: [{ name_snapshot: "Coconut Matcha Cloud", qty: 1 }] }} />
  </NextIntlClientProvider>);
  expect(screen.getByText("Drink selected")).toBeVisible();
  expect(screen.queryByText("Choose your drink")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View your drink" }));
  expect(push).toHaveBeenCalledWith(`${path}/prepare`);
});

it("offers a first selection when there is no saved order", () => {
  render(<NextIntlClientProvider locale="en" messages={messages}>
    <FloatingRsvpBar {...props} drinkSelection={null} />
  </NextIntlClientProvider>);
  expect(screen.getByRole("button", { name: "Choose your drink" })).toBeVisible();
});
