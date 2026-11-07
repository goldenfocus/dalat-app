import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/types";
import { ProfileEditForm } from "./profile-edit-form";

const { update, save, refreshViewer, refreshRoute } = vi.hoisted(() => ({
  update: vi.fn(), save: vi.fn(), refreshViewer: vi.fn(), refreshRoute: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshRoute }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/hooks/use-viewer", () => ({ refreshViewer }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
  from: () => ({ update: (fields: unknown) => { update(fields); return { eq: save }; } }),
}) }));
vi.mock("@/components/ui/ai-enhance-textarea", () => ({ AIEnhanceTextarea: () => null }));
vi.mock("./ai-avatar-dialog", () => ({ AIAvatarDialog: () => null }));
vi.mock("./avatar-upload", () => ({ AvatarUpload: ({ onAvatarChange }: {
  onAvatarChange: (url: string | null) => Promise<void>;
}) => <>
  <button onClick={() => void onAvatarChange("new-photo.jpg")}>Upload photo</button>
  <button onClick={() => void onAvatarChange(null)}>Remove photo</button>
</> }));

const profile = {
  id: "viewer", username: "yan", display_name: "Yan", bio: "", avatar_url: "old-photo.jpg",
} as Profile;
beforeEach(() => { vi.clearAllMocks(); save.mockResolvedValue({ error: null }); });
afterEach(cleanup);

it.each([ ["Upload photo", "new-photo.jpg"], ["Remove photo", null] ])(
  "refreshes the current header identity after %s succeeds on the same route", async (button, avatarUrl) => {
    let finish!: (value: unknown) => void;
    save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<ProfileEditForm profile={profile} />);
    fireEvent.click(screen.getByRole("button", { name: button! }));
    expect(update).toHaveBeenCalledWith({ avatar_url: avatarUrl });
    expect(refreshViewer).not.toHaveBeenCalled();
    await act(async () => { finish({ error: null }); });
    expect(refreshViewer).toHaveBeenCalledTimes(1);
    expect(refreshRoute).toHaveBeenCalledTimes(1);
  },
);

it("keeps the confirmed header identity when the avatar save fails", async () => {
  save.mockResolvedValueOnce({ error: { message: "Save failed" } });
  render(<ProfileEditForm profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
  await waitFor(() => expect(screen.getByText("Save failed")).toBeInTheDocument());
  expect(refreshViewer).not.toHaveBeenCalled();
  expect(refreshRoute).not.toHaveBeenCalled();
});
