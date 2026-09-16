import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyMusicImport, MUSIC_IMPORT_PREFERENCE } from "@/lib/playlist-import";
const state = vi.hoisted(() => ({ preference: {} as unknown }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner", user_metadata: { ["event_music_import"]: state.preference } } } }) } }) }));
import { PlaylistImportInput } from "./playlist-import-input";
function Form() { const [value, onChange] = useState(emptyMusicImport); return <><PlaylistImportInput value={value} onChange={onChange} userId="owner" /><output data-testid="value">{JSON.stringify(value)}</output></>; }
beforeEach(() => {
  state.preference = { enabled: true, sourcePlaylistId: "past" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ playlists: [{ id: "past", title: "Music", events: { title: "Past event", starts_at: "2026-01-02" }, playlist_tracks: [{ id: "song", title: "Song", sort_order: 0 }] }] }) }));
});
describe("music import controls", () => {
  it("restores the account default and lets the host choose individual tracks or disable it", async () => {
    render(<Form />);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("past"));
    expect(screen.getByRole("checkbox", { name: /importPastMusic/ })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "importWholePlaylist" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Song" }));
    expect(JSON.parse(screen.getByTestId("value").textContent!)).toEqual({ enabled: true, sourcePlaylistId: "past", trackIds: ["song"] });
    fireEvent.click(screen.getByRole("checkbox", { name: /importPastMusic/ }));
    expect(JSON.parse(screen.getByTestId("value").textContent!).enabled).toBe(false);
  });
  it("does not silently select another event when the saved source disappears", async () => {
    state.preference = { enabled: true, sourcePlaylistId: "deleted" };
    render(<Form />);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue(""));
    expect(MUSIC_IMPORT_PREFERENCE).toBe("event_music_import");
  });
});
