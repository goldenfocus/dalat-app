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
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ venues: [] }) })
    );
    render(<LocationPicker />);

    await typeQuery(TYPED);

    expect(hiddenInput("location_name").value).toBe(TYPED);
    expect(hiddenInput("address").value).toBe(TYPED);
    expect(hiddenInput("google_maps_url").value).toContain(
      encodeURIComponent(TYPED)
    );
  });

  it("offers a 'use as typed' row that selects the text as a custom location", async () => {
    const onLocationSelect = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ venues: [] }) })
    );
    render(<LocationPicker onLocationSelect={onLocationSelect} />);

    await typeQuery(TYPED);
    fireEvent.click(screen.getByText(`locationUseCustom:${TYPED}`));

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
    expect(screen.getByText(`locationUseCustom:${TYPED}`)).toBeInTheDocument();
  });
});
