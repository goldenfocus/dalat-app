import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { Workshop } from "./workshop";
import { STORAGE_KEY } from "./workshop-state";
import en from "@/messages/phuong/en.json";
vi.mock("@/lib/i18n/routing", () => ({
  Link: ({
    locale: _locale,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { locale?: string }) => (
    <a {...props}>{children}</a>
  ),
}));
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401 }))); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("workshop interactions", () => {
  it("saves role and field changes, then confirms reset", async () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    render(<Workshop copy={en} language="en" />);
    const love = within(
      screen.getByRole("group", { name: "City scout" }),
    ).getByRole("button", { name: "Love it" });
    await waitFor(() => expect(love).toBeEnabled());
    fireEvent.click(love);
    expect(love).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Our first experiment" }),
      { target: { value: "Three conversations" } },
    );
    expect(JSON.parse(data.get(STORAGE_KEY)!)).toMatchObject({
      experiment: "Three conversations",
      roles: { 0: 0 },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear this meeting" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, clear meeting" }));
    expect(
      screen.getByRole("textbox", { name: "Our first experiment" }),
    ).toHaveValue("");
    expect(JSON.parse(data.get(STORAGE_KEY)!)).toMatchObject({
      experiment: "",
      roles: {},
    });
  });
  it("keeps editing available when browser storage throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("blocked");
      },
    });
    render(<Workshop copy={en} language="en" />);
    await waitFor(() =>
      expect(screen.getByText(en.saveError)).toBeInTheDocument(),
    );
    const field = screen.getByRole("textbox", { name: "Our first experiment" });
    fireEvent.change(field, { target: { value: "Still editable" } });
    expect(field).toHaveValue("Still editable");
  });
});
