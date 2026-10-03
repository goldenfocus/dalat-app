import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { isPeopleEnabled } from "@/lib/people/constants";
import { getEventPeople, getPeopleProfile, getPeopleViewer } from "@/lib/people/server";
import { EventPeople } from "./event-people";
import { PeopleProfileSection } from "./people-profile-section";

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/people/constants", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/people/constants")>(),
  isPeopleEnabled: vi.fn(),
}));
vi.mock("@/lib/people/server", () => ({ getPeopleViewer: vi.fn(), getPeopleProfile: vi.fn(), getEventPeople: vi.fn() }));
vi.mock("@/lib/i18n/routing", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("./people-retry", () => ({ PeopleRetry: ({ label }: { label: string }) => <button>{label}</button> }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isPeopleEnabled).mockReturnValue(true);
  vi.mocked(getPeopleViewer).mockResolvedValue({ user: { id: "viewer" }, profile: { id: "viewer", is_private: false, is_ghost: false } });
});
afterEach(cleanup);

describe("People sections on existing pages", () => {
  it("does not add authentication or data work while the feature is disabled", async () => {
    vi.mocked(isPeopleEnabled).mockReturnValue(false);
    expect(await EventPeople({ eventId: "event", locale: "en" })).toBeNull();
    expect(await PeopleProfileSection({ userId: "person", locale: "en" })).toBeNull();
    expect(getPeopleViewer).not.toHaveBeenCalled();
    expect(getEventPeople).not.toHaveBeenCalled();
    expect(getPeopleProfile).not.toHaveBeenCalled();
  });

  it("does not load private discovery details for signed-out visitors", async () => {
    vi.mocked(getPeopleViewer).mockResolvedValue({ user: null, profile: null });
    expect(await EventPeople({ eventId: "event", locale: "en" })).toBeNull();
    expect(await PeopleProfileSection({ userId: "person", locale: "en" })).toBeNull();
    expect(getEventPeople).not.toHaveBeenCalled();
    expect(getPeopleProfile).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable profile service from a paused profile", async () => {
    vi.mocked(getPeopleProfile).mockResolvedValue(null);
    expect(await PeopleProfileSection({ userId: "person", locale: "en" })).toBeNull();
    vi.mocked(getPeopleProfile).mockRejectedValue(new Error("missing migration"));
    render(await PeopleProfileSection({ userId: "person", locale: "en" }));
    expect(screen.getByRole("heading")).toHaveTextContent("unavailableTitle");
  });

  it("does not display a false empty event roster when the service fails", async () => {
    vi.mocked(getEventPeople).mockRejectedValue(new Error("missing migration"));
    render(await EventPeople({ eventId: "event", locale: "en" }));
    expect(screen.getByRole("heading")).toHaveTextContent("unavailableTitle");
    expect(screen.queryByText("eventEmpty")).not.toBeInTheDocument();
  });
});
