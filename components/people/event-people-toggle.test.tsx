import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EventPeopleToggle } from "./event-people-toggle";
import { requestPeople } from "./request";

vi.mock("@/lib/i18n/routing", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./request", () => ({ requestPeople: vi.fn() }));

const copy = {
  share: "Share at this event", description: "Only your People profile", attendeeNotice: "Attendance remains public",
  required: "Enable People and RSVP first", shared: "Shared", unshared: "Hidden from event People", error: "Could not confirm this change",
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("event People consent", () => {
  it("does not offer enrollment without profile opt-in and a going RSVP", () => {
    render(<EventPeopleToggle eventId="event-a" joined={false} canJoin={false} copy={copy} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText(copy.required)).toBeVisible();
    expect(requestPeople).not.toHaveBeenCalled();
  });

  it("allows withdrawal even if the person is no longer eligible to join", async () => {
    vi.mocked(requestPeople).mockResolvedValue({ success: true });
    render(<EventPeopleToggle eventId="event-a" joined canJoin={false} copy={copy} />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(requestPeople).toHaveBeenCalledWith("/api/people/event", "DELETE", { event_id: "event-a" }));
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(screen.getByText(copy.attendeeNotice)).toBeVisible();
  });

  it("keeps the prior visibility state when a withdrawal cannot be confirmed", async () => {
    vi.mocked(requestPeople).mockRejectedValue(new Error("timeout"));
    render(<EventPeopleToggle eventId="event-a" joined canJoin copy={copy} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.error);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});
