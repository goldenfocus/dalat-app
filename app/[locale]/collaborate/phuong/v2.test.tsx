import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { PhuongV2 } from "./v2";
import en from "@/messages/phuong/v2/en.json";
import { emptyPlan } from "@/lib/phuong/plan";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const session = (role = "phuong") => ({
  ok: true,
  json: async () => ({
    role,
    plan: { content: emptyPlan(), version: 0 },
    actions: [],
  }),
});
it("does not expose private inputs to visitors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ status: 403 })),
  );
  render(<PhuongV2 copy={en} language="en" />);
  await screen.findByText(en.denied);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
it("offers alternate date and saves only after an explicit action", async () => {
  const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) =>
    options?.method === "POST"
      ? { ok: true, json: async () => ({ version: 1 }) }
      : session(),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<PhuongV2 copy={en} language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: en.choices[2] }));
  expect(screen.getByLabelText(en.date)).toBeInTheDocument();
  fireEvent.input(screen.getByLabelText(en.date), {
    target: { value: "2026-09-26" },
  });
  expect(
    fetcher.mock.calls.filter((c) => c[1]?.method === "POST"),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: en.save }));
  await screen.findByText(en.saved);
  const post = fetcher.mock.calls.find((c) => c[1]?.method === "POST");
  expect(JSON.parse(post![1]!.body as string)).toMatchObject({
    action: "decision",
    expectedVersion: 0,
    plan: { birthday: "date", date: "2026-09-26" },
  });
});
it("keeps birthday private and does not show party configuration without opting in", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => session()),
  );
  render(<PhuongV2 copy={en} language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: en.choices[4] }));
  expect(screen.getByLabelText(en.normal)).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "3. " + en.steps[2] }));
  expect(screen.queryByLabelText(en.name)).not.toBeInTheDocument();
});
it("Zan can review but cannot edit Phuong’s answers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => session("zan")),
  );
  render(<PhuongV2 copy={en} language="en" />);
  await waitFor(() => expect(screen.getByLabelText(en.plans)).toBeDisabled());
  expect(
    screen.queryByRole("button", { name: en.save }),
  ).not.toBeInTheDocument();
});
