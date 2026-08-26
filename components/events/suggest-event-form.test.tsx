import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SuggestEventForm, type SuggestEventCopy } from "./suggest-event-form";

const copy: SuggestEventCopy = {
  urlLabel: "urlLabel",
  urlPlaceholder: "urlPlaceholder",
  privacyNote: "privacyNote",
  submit: "submit",
  submitting: "submitting",
  success: "success",
  successDelayed: "successDelayed",
  duplicate: "duplicate",
  suggestAnother: "suggestAnother",
  errors: {
    unsafe_url: "unsafeUrl",
    network: "networkError",
    unknown: "unknownError",
  },
};

describe("SuggestEventForm", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("submits one source URL and confirms the review-only state", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "queued_for_review", reviewDelayed: false }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SuggestEventForm copy={copy} />);

    fireEvent.change(screen.getByLabelText("urlLabel"), {
      target: { value: "https://example.com/events/flower-night" },
    });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await screen.findByText("success");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/events/suggest",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/events/flower-night" }),
      })
    );
  });

  it("shows a translated API error without leaving the form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ code: "unsafe_url" }),
      })
    );
    render(<SuggestEventForm copy={copy} />);

    fireEvent.change(screen.getByLabelText("urlLabel"), {
      target: { value: "http://127.0.0.1/event" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "submit" }).closest("form")!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("unsafeUrl"));
  });
});
