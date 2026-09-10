import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkshopAnswers } from "./workshop-answers";
import en from "@/messages/phuong/en.json";
const data = { author: { id: "a", name: "Writer", username: "writer" }, answers: [{ question_id: 1, content: "Earlier answer", updated_at: "2026-09-10T12:00:00Z" }] };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("inline answers", () => {
  it("offers existing localized login without exposing saved answers to guests", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401 })));
    render(<WorkshopAnswers copy={en} language="vi" />);
    expect(await screen.findByRole("link", {name: en.answers.login})).toHaveAttribute("href", "/vi/auth/login");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("loads attributed answers, edits and saves with verified account context", async () => {
    const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => options?.method === "POST" ? { ok: true, json: async () => ({ answer: { ...data.answers[0], content: "Updated answer" } }) } : { ok: true, json: async () => data });
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(<WorkshopAnswers copy={en} language="en" />);
    await screen.findByText("Writing as Writer");
    fireEvent.click(screen.getByText(en.prompts[0][0]));
    const textarea = container.querySelector("textarea")!;
    expect(textarea).toHaveValue("Earlier answer");
    fireEvent.change(textarea, { target: { value: "Updated answer" } });
    fireEvent.click(screen.getAllByRole("button", { name: en.answers.save })[0]);
    await waitFor(() => expect(screen.getAllByRole("button", { name: en.answers.save })[0]).toBeDisabled());
    expect(fetcher).toHaveBeenCalledWith("/api/workshop-answers", expect.objectContaining({ method: "POST", body: JSON.stringify({ question_id: 1, content: "Updated answer", expected_author_id: "a" }) }));
  });
  it("keeps unsaved text when the account changes and never posts it", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => data }).mockResolvedValue({ ok: true, json: async () => ({ ...data, author: { ...data.author, id: "b" } }) });
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(<WorkshopAnswers copy={en} language="en" />);
    await screen.findByText("Writing as Writer");
    fireEvent.click(screen.getByText(en.prompts[0][0]));
    const textarea = container.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "Do not misattribute" } });
    fireEvent.click(screen.getAllByRole("button", {name: en.answers.save})[0]);
    await screen.findByText(en.answers.expired);
    expect(textarea).toHaveValue("Do not misattribute");
    expect(fetcher.mock.calls.every(call => call[1]?.method !== "POST")).toBe(true);
  });
});
