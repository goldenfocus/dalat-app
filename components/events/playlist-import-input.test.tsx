import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyMusicImport } from "@/lib/playlist-import";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
import { PlaylistImportInput } from "./playlist-import-input";
function Form({ eventId, onImported }: { eventId?: string; onImported?: () => void } = {}) { const [value, onChange] = useState(emptyMusicImport); return <><PlaylistImportInput value={value} onChange={onChange} eventId={eventId} onImported={onImported} /><output data-testid="value">{JSON.stringify(value)}</output></>; }
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ playlists: [{ id: "past", title: "Music", events: { title: "Past event", starts_at: "2026-01-02" }, playlist_tracks: [{ id: "song", title: "Song", sort_order: 0 }] }] }) }));
});
describe("music import controls", () => {
  it("offers immediate import while editing without changing account defaults or submitting the event form", async () => {
    const onImported = vi.fn();
    render(<Form eventId="existing-event" onImported={onImported} />);
    await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
    expect(fetch).toHaveBeenCalledWith("/api/playlists/import?eventId=existing-event");
    expect(screen.queryByRole("checkbox", { name: /importPastMusic/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "past" } });
    const button = screen.getByRole("button", { name: "importNow" });
    expect(button).toHaveAttribute("type", "button");
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ count: 1, skipped: 1 }) } as Response);
    fireEvent.click(button);
    await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    expect(screen.getByText("importComplete")).toHaveAttribute("role", "status");
    expect(JSON.parse(screen.getByTestId("value").textContent!).enabled).toBe(false);
  });
  it("starts unchecked and lets the host opt in and choose individual tracks", async () => {
    render(<Form />);
    const enable = await screen.findByRole("checkbox", { name: "importPastMusic" });
    expect(enable).not.toBeChecked();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(enable);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "past" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "importWholePlaylist" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Song" }));
    expect(JSON.parse(screen.getByTestId("value").textContent!)).toEqual({ enabled: true, sourcePlaylistId: "past", trackIds: ["song"] });
    fireEvent.click(enable);
    expect(JSON.parse(screen.getByTestId("value").textContent!).enabled).toBe(false);
  });

  it("shows no music import options when the creator has no past tracks", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({
      playlists: [{ id: "past", title: null, events: { title: "Past event", starts_at: "2026-01-02" }, playlist_tracks: [] }],
    }) } as Response);
    await act(async () => { render(<Form />); });
    expect(fetch).toHaveBeenCalledWith("/api/playlists/import");
    expect(screen.queryByRole("checkbox", { name: "importPastMusic" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
