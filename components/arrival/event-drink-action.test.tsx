import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import viMessages from "@/messages/vi.json";
import { EventDrinkAction } from "./event-drink-action";

vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
afterEach(cleanup);

it.each(["en", "vi"])("acknowledges an existing selection and links to its receipt in %s", locale => {
  const messages = locale === "en" ? en : viMessages;
  const t = messages.arrival.registration;
  render(<NextIntlClientProvider locale={locale} messages={messages}>
    <EventDrinkAction slug="exchange" selection={{ items: [{ name_snapshot: "Cà phê sữa", qty: 1 }] }} />
  </NextIntlClientProvider>);
  expect(screen.getByRole("status")).toHaveTextContent(t.drinkSelected);
  expect(screen.getByText("1 × Cà phê sữa")).toBeVisible();
  expect(screen.getByRole("link", { name: t.viewDrink })).toHaveAttribute("href", "/events/exchange/prepare");
  expect(screen.queryByText(t.chooseDrink)).toBeNull();
});

it("invites a first selection only when there is no saved order", () => {
  render(<NextIntlClientProvider locale="en" messages={en}>
    <EventDrinkAction slug="exchange" selection={null} />
  </NextIntlClientProvider>);
  expect(screen.getByRole("link", { name: "Choose your drink" })).toBeVisible();
  expect(screen.queryByRole("status")).toBeNull();
});

it("does not claim the order is missing when its lookup fails", () => {
  render(<NextIntlClientProvider locale="en" messages={en}>
    <EventDrinkAction slug="exchange" selection={undefined} />
  </NextIntlClientProvider>);
  expect(screen.getByRole("link", { name: "View your drink" })).toBeVisible();
  expect(screen.queryByText("Choose your drink")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});
