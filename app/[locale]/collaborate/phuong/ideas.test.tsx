import React from "react";
import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { IdeaMenu } from "./ideas";
import en from "@/messages/phuong/v2/en.json";
const yan = "303f96f6-0501-465c-9ee5-96e6136bb8bb";
const phuong = "36bdd750-ab6a-4a02-96dd-afd8d6661d29";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([yan, phuong])(
  "lets either participant save only their own rating and preserves the other vote: %s",
  async (userId) => {
    const other = userId === yan ? phuong : yan;
    const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => ({
      ok: true,
      json: async () =>
        options?.method === "POST"
          ? { saved: true }
          : {
              userId,
              votes: [{ user_id: other, idea_id: "drink", rating: "up" }],
            },
    }));
    vi.stubGlobal("fetch", fetcher);
    render(<IdeaMenu copy={en.ideas} />);
    await screen.findAllByText(/· You/);
    const card = screen
      .getByRole("heading", { name: en.ideas.items.drink.title })
      .closest("article")!;
    fireEvent.click(
      within(card).getByRole("button", { name: "🤔 " + en.ideas.unsure }),
    );
    await screen.findByText(en.ideas.saved);
    const post = fetcher.mock.calls.find((c) => c[1]?.method === "POST");
    expect(JSON.parse(post![1]!.body as string)).toEqual({
      ideaId: "drink",
      rating: "unsure",
    });
    expect(card.querySelector(".pv-vote-people")?.textContent).toContain(
      "👍 Love it",
    );
    expect(
      within(card).getByRole("button", { name: "🤔 " + en.ideas.unsure }),
    ).toHaveAttribute("aria-pressed", "true");
  },
);
it("does not report a failed save as a saved vote", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => ({
      ok: !options?.method,
      json: async () => ({ userId: yan, votes: [] }),
    })),
  );
  render(<IdeaMenu copy={en.ideas} />);
  await screen.findAllByText(/· You/);
  const card = screen
    .getByRole("heading", { name: en.ideas.items.drink.title })
    .closest("article")!;
  fireEvent.click(
    within(card).getByRole("button", { name: "👍 " + en.ideas.up }),
  );
  await screen.findByText(en.ideas.error);
  expect(
    within(card).getByRole("button", { name: "👍 " + en.ideas.up }),
  ).toHaveAttribute("aria-pressed", "false");
});
