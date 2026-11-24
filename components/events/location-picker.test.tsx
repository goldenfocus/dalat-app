import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LocationPicker } from "@/components/events/location-picker";

vi.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, params?: Record<string, string>) =>
      params?.text ? `${key}:${params.text}` : key,
}));

const TYPED = "20 D. Sương Nguyệt Anh";

function hiddenInput(name: string): HTMLInputElement {
  const el = document.querySelector(`input[name="${name}"]`);
  if (!el) throw new Error(`hidden input ${name} not rendered`);
  return el as HTMLInputElement;
}

async function typeQuery(value: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400); // past the 300ms debounce
  });
}

describe("LocationPicker free-text fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Regression: typed-but-unselected addresses used to be silently discarded on save.
  it("submits the typed text as the location even without selecting a suggestion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ venues: [] }) })
    );
    render(<LocationPicker />);

    expect(screen.queryByRole("link", { name: "locationPreviewMap" })).toBeNull();
    await typeQuery(TYPED);
    expect(screen.getByRole("link", { name: "locationPreviewMap" })).toHaveAttribute(
      "href", "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(TYPED),
    );

    expect(hiddenInput("location_name").value).toBe(TYPED);
    expect(hiddenInput("address").value).toBe(TYPED);
    expect(hiddenInput("google_maps_url").value).toContain(
      encodeURIComponent(TYPED)
    );
  });

  it("keeps a pasted Maps link when lookup is slow or unsuccessful", async () => {
    const url = "https://maps.app.goo.gl/example";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 422 })));
    render(<LocationPicker />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: url } });
    expect(hiddenInput("google_maps_url").value).toBe(url);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(hiddenInput("google_maps_url").value).toBe(url);
    expect(hiddenInput("latitude").value).toBe("");
    expect(screen.getByRole("link", { name: "locationPreviewMap" })).toHaveAttribute("href", url);
  });

  it("saves the only exact numbered address match without requiring a dropdown click", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ venues: [{
      id: "known-venue", name: "Known venue", address: "20 Đường Sương Nguyệt Anh, Đà Lạt",
      latitude: 11.94, longitude: 108.44, googleMapsUrl: "https://maps.google.com/?cid=123",
    }] })));
    render(<LocationPicker />);
    await typeQuery(TYPED);
    expect(hiddenInput("latitude").value).toBe("11.94");
    expect(hiddenInput("longitude").value).toBe("108.44");
    expect(hiddenInput("google_maps_url").value).toBe("https://maps.google.com/?cid=123");
    expect(screen.getByRole("textbox")).toHaveValue(TYPED);
    expect(screen.getByRole("link", { name: "locationPreviewMap" })).toHaveAttribute(
      "href", "https://www.google.com/maps/dir/?api=1&destination=11.94,108.44",
    );
  });

  it("offers a 'use as typed' row that selects the text as a custom location", async () => {
    const onLocationSelect = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ venues: [] }) })
    );
    render(<LocationPicker onLocationSelect={onLocationSelect} />);

    await typeQuery(TYPED);
    fireEvent.click(screen.getByRole("button", { name: /locationUseAsTyped/ }));

    expect(onLocationSelect).toHaveBeenCalledWith(
      expect.objectContaining({ type: "custom", name: TYPED, address: TYPED })
    );
    expect(hiddenInput("location_name").value).toBe(TYPED);
  });

  it("shows an honest unavailable message instead of 'no results' when search fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<LocationPicker />);

    await typeQuery(TYPED);

    expect(screen.getByText("locationSearchUnavailable")).toBeInTheDocument();
    expect(screen.queryByText("locationNoResults")).not.toBeInTheDocument();
    // The fallback row is still offered — never a dead end
    expect(screen.getByRole("button", { name: /locationUseAsTyped/ })).toBeInTheDocument();
  });
  it("automatically retries an unmatched query and keeps the typed address until selection", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ venues: [] }))
      .mockResolvedValueOnce(Response.json({ suggestion: "20 Duong Suong Nguyet Anh Da Lat" }))
      .mockResolvedValueOnce(Response.json({ venues: [{
        id: "node/4321", name: "Example Coffee", address: "20 Duong Suong Nguyet Anh",
        venueType: "cafe", latitude: 11.94, longitude: 108.44, isPublicMapPlace: true,
      }] }));
    vi.stubGlobal("fetch", request);
    const select = vi.fn();
    render(<LocationPicker onLocationSelect={select} />);
    await typeQuery(TYPED);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(request).toHaveBeenNthCalledWith(2, "/api/events/address-assist", expect.objectContaining({
      method: "POST", body: JSON.stringify({ query: TYPED }),
    }));
    expect(request.mock.calls[2][0]).toContain("20%20Duong%20Suong");
    expect(hiddenInput("address").value).toBe(TYPED);
    fireEvent.click(screen.getByRole("button", { name: /Example Coffee/ }));
    expect(select).toHaveBeenLastCalledWith(expect.objectContaining({ type: "place", name: "Example Coffee" }));
    expect(hiddenInput("venue_id").value).toBe("");
  });

  it("keeps private searches away from the address assistant and new public-map suggestions", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ venues: [] }));
    vi.stubGlobal("fetch", request);
    render(<LocationPicker addressAssistEnabled={false} />);
    await typeQuery(TYPED);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/venues/search?q=" + encodeURIComponent(TYPED));
    expect(hiddenInput("address").value).toBe(TYPED);
  });
});
