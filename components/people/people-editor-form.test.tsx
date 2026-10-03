import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PeopleProfile } from "@/lib/people/types";
import { PeopleEditorForm, type PeopleEditorCopy } from "./people-editor-form";
import { requestPeople } from "./request";
import { triggerTranslation } from "@/lib/translations-client";

vi.mock("@/lib/i18n/routing", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/ui/ai-enhance-textarea", () => ({
  AIEnhanceTextarea: ({ onChange, context: _context, ...props }: { onChange: (value: string) => void; context?: string }) =>
    <textarea {...props} onChange={(event) => onChange(event.target.value)} />,
}));
vi.mock("./request", () => ({ requestPeople: vi.fn() }));
vi.mock("@/lib/translations-client", () => ({ triggerTranslation: vi.fn(async () => true) }));

const copy = Object.fromEntries([
  "enabled", "enabledDescription", "privateHint", "identityDescription", "editIdentity",
  "intentionsLabel", "interestsLabel", "languagesLabel", "helpOffered", "helpOfferedPlaceholder",
  "helpWanted", "helpWantedPlaceholder", "privacyNotice", "save", "saving", "saved", "saveError",
  "translationPending", "hideNow", "hiding", "hidden",
].map((key) => [key, key])) as unknown as PeopleEditorCopy;
copy.intentions = { friendship: "friendship" };
copy.interests = { coffee: "coffee" };

const profile: PeopleProfile = {
  user_id: "db8b94cc-c7b8-4728-9e60-b24116481d54", enabled: true,
  intentions: ["friendship"], interests: ["coffee"], languages: ["en"],
  help_offered: "Gardening", help_wanted: "Vietnamese practice", source_locale: "en",
  created_at: "2026-10-02T00:00:00Z", updated_at: "2026-10-02T00:00:00Z", content_updated_at: "2026-10-02T00:00:00Z",
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("People consent editor", () => {
  it("waits for deliberate Save before publishing a new profile", async () => {
    vi.mocked(requestPeople).mockResolvedValue({ profile: { ...profile, help_offered: "", help_wanted: "" } });
    render(<PeopleEditorForm initialProfile={null} isPrivate={false} locale="en" copy={copy} />);
    fireEvent.click(screen.getByRole("checkbox", { name: copy.enabled }));
    expect(requestPeople).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: copy.save }));
    await waitFor(() => expect(requestPeople).toHaveBeenCalledWith("/api/people/profile", "POST", expect.objectContaining({ enabled: true })));
    await screen.findByRole("status");
  });

  it("hides immediately without submitting or discarding unsaved help text", async () => {
    vi.mocked(requestPeople).mockResolvedValue({ success: true });
    render(<PeopleEditorForm initialProfile={profile} isPrivate={false} locale="en" copy={copy} />);
    fireEvent.change(screen.getByLabelText(copy.helpOffered), { target: { value: "An unsaved draft" } });
    fireEvent.click(screen.getByRole("checkbox", { name: copy.enabled }));
    await waitFor(() => expect(requestPeople).toHaveBeenCalledWith("/api/people/profile", "PATCH", { enabled: false }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: copy.enabled })).not.toBeChecked());
    expect(screen.getByLabelText(copy.helpOffered)).toHaveValue("An unsaved draft");
    expect(triggerTranslation).not.toHaveBeenCalled();
  });

  it("does not claim a profile is hidden when opt-out fails", async () => {
    vi.mocked(requestPeople).mockRejectedValue(new Error("network unavailable"));
    render(<PeopleEditorForm initialProfile={profile} isPrivate={false} locale="en" copy={copy} />);
    fireEvent.click(screen.getByRole("checkbox", { name: copy.enabled }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.saveError);
    expect(screen.getByRole("checkbox", { name: copy.enabled })).toBeChecked();
  });

  it("cannot enable discovery while the identity profile is private", async () => {
    vi.mocked(requestPeople).mockResolvedValue({ profile: { ...profile, enabled: false } });
    render(<PeopleEditorForm initialProfile={profile} isPrivate locale="en" copy={copy} />);
    expect(screen.getByRole("checkbox", { name: copy.enabled })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: copy.enabled })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: copy.save }));
    await waitFor(() => expect(requestPeople).toHaveBeenCalledWith("/api/people/profile", "POST", expect.objectContaining({ enabled: false })));
    await screen.findByRole("status");
  });

  it("invalidates translated help text when the source is cleared", async () => {
    vi.mocked(requestPeople).mockResolvedValue({ profile: { ...profile, help_offered: "" } });
    render(<PeopleEditorForm initialProfile={profile} isPrivate={false} locale="en" copy={copy} />);
    fireEvent.change(screen.getByLabelText(copy.helpOffered), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: copy.save }));
    await waitFor(() => expect(triggerTranslation).toHaveBeenCalledWith("people", profile.user_id, [{ field_name: "help_offered", text: "" }]));
  });
});
