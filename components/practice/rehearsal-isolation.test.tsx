import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("@/lib/hooks/use-viewer", () => ({ useViewer: () => ({ profile: { id: "real-account" } }) }));
vi.mock("./practice-profile", () => ({ PracticeProfile: () => <div data-testid="real-profile-editor" /> }));
vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children }: { children: React.ReactNode }) => children }));
import { EventPractice } from "./event-practice";
import { createRehearsal, rehearsalView } from "./rehearsal-model";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("never opens a real account editor from a signed-in sample guest", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const sample = { ...createRehearsal(), mode: "attendee" as const };
  const transport = async () => new Response(JSON.stringify(rehearsalView(sample)));
  render(<EventPractice slug="sample-rehearsal" transport={transport}/>);
  await screen.findByRole("button", { name: "playCards" });
  expect(screen.queryByRole("button", { name: "languageLabel" })).toBeNull();
  expect(screen.queryByTestId("real-profile-editor")).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it("never issues a real receipt from the sample host", async () => {
  const transport = async () => new Response(JSON.stringify(rehearsalView(createRehearsal())));
  render(<EventPractice slug="sample-rehearsal" transport={transport}/>);
  fireEvent.click(await screen.findByRole("button", { name: /Mai/ }));
  expect(screen.queryByRole("button", { name: "code" })).toBeNull();
  expect(screen.queryByTestId("real-profile-editor")).toBeNull();
});
