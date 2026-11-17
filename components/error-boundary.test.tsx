import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRecoveryForTests } from "@/lib/errors/recovery";
import { ErrorBoundary } from "./error-boundary";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/map",
  unstable_rethrow: () => {},
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

let broken = true;
function Page() {
  if (broken) throw new TypeError("network error");
  return <p>the map</p>;
}

const settle = () => act(() => vi.advanceTimersByTimeAsync(1_000));

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    refresh.mockReset();
    resetRecoveryForTests();
    broken = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("recovers by itself from a payload that was cut off mid-stream", async () => {
    render(<ErrorBoundary><Page /></ErrorBoundary>);

    // No error screen while the automatic retry is pending.
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("somethingWentWrong")).toBeNull();

    broken = false;
    await settle();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("the map")).toBeTruthy();
  });

  it("shows the error screen once the automatic retry has failed too", async () => {
    render(<ErrorBoundary><Page /></ErrorBoundary>);
    await settle();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("somethingWentWrong")).toBeTruthy();
  });

  it("re-fetches the route when the visitor presses Try again", async () => {
    render(<ErrorBoundary><Page /></ErrorBoundary>);
    await settle();

    broken = false;
    fireEvent.click(screen.getByText("tryAgain"));

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByText("the map")).toBeTruthy();
  });
});
